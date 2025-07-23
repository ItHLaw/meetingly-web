import httpx
import os
import asyncio
from typing import Optional, Dict, Any
import aiofiles

from app.core.config import settings

class WhisperService:
    def __init__(self):
        self.whisper_url = os.getenv("WHISPER_SERVICE_URL", "http://localhost:8080")
        self.timeout = 300  # 5 minutes timeout for transcription
    
    async def transcribe_audio(self, file_path: str, model: str = "base", enable_diarization: bool = True, language: str = "auto") -> Dict[str, Any]:
        """Transcribe audio file using Whisper service with optional speaker diarization"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Read audio file
                async with aiofiles.open(file_path, 'rb') as f:
                    audio_data = await f.read()
                
                # Prepare request
                files = {
                    'file': ('audio.wav', audio_data, 'audio/wav')
                }
                data = {
                    'model': model,
                    'response_format': 'json',
                    'language': language if language != "auto" else "",
                    'diarize': 'true' if enable_diarization else 'false',
                    'timestamp_granularities[]': 'segment',  # Enable segment timestamps
                    'temperature': '0.0',  # More deterministic output
                }
                
                # Make request to Whisper service
                response = await client.post(
                    f"{self.whisper_url}/inference",
                    files=files,
                    data=data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    segments = result.get("segments", [])
                    
                    # Process segments to extract speaker information if available
                    processed_segments = []
                    for segment in segments:
                        processed_segment = {
                            "text": segment.get("text", ""),
                            "start": segment.get("start", 0),
                            "end": segment.get("end", 0),
                            "confidence": segment.get("confidence", 0.0),
                        }
                        
                        # Extract speaker information if present in the text
                        text = segment.get("text", "")
                        speaker_id = self._extract_speaker_from_text(text)
                        if speaker_id:
                            processed_segment["speaker_id"] = speaker_id
                            processed_segment["text"] = self._clean_speaker_text(text)
                        
                        processed_segments.append(processed_segment)
                    
                    return {
                        "text": result.get("text", ""),
                        "segments": processed_segments,
                        "language": result.get("language", "en"),
                        "confidence": self._calculate_average_confidence(processed_segments),
                        "has_speakers": any(segment.get("speaker_id") for segment in processed_segments),
                        "speakers_detected": list(set(segment.get("speaker_id") for segment in processed_segments if segment.get("speaker_id")))
                    }
                else:
                    raise Exception(f"Whisper service error: {response.status_code} - {response.text}")
                    
        except Exception as e:
            # Fallback to local processing or return error
            return {
                "text": f"Transcription failed: {str(e)}",
                "segments": [],
                "language": "en",
                "confidence": 0.0,
                "error": str(e)
            }
    
    def _calculate_average_confidence(self, segments: list) -> float:
        """Calculate average confidence from segments"""
        if not segments:
            return 0.0
        
        total_confidence = sum(segment.get('confidence', 0.0) for segment in segments)
        return total_confidence / len(segments)
    
    def _extract_speaker_from_text(self, text: str) -> Optional[str]:
        """Extract speaker ID from text if present"""
        import re
        
        # Look for speaker patterns like "(speaker 0)", "(speaker 1)", etc.
        speaker_match = re.match(r'^\(speaker (\d+|\?)\)', text.strip())
        if speaker_match:
            speaker_id = speaker_match.group(1)
            return f"speaker_{speaker_id}" if speaker_id != "?" else "speaker_unknown"
        
        return None
    
    def _clean_speaker_text(self, text: str) -> str:
        """Remove speaker annotation from text"""
        import re
        
        # Remove speaker patterns like "(speaker 0)" from the beginning of text
        cleaned = re.sub(r'^\(speaker (\d+|\?)\)\s*', '', text.strip())
        return cleaned
    
    async def get_supported_models(self) -> list:
        """Get list of supported Whisper models"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.whisper_url}/models")
                if response.status_code == 200:
                    return response.json().get("models", [])
                else:
                    return ["tiny", "base", "small", "medium", "large"]
        except Exception:
            return ["tiny", "base", "small", "medium", "large"]