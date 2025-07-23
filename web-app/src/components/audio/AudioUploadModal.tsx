'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { XMarkIcon, DocumentIcon, CloudArrowUpIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { notify } from '@/services/notificationService';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (jobId: string, meetingId: string) => void;
}

interface UploadOptions {
  meetingName: string;
  enableDiarization: boolean;
  model: string;
  language: string;
  temperature: number;
  beamSize: number;
  wordTimestamps: boolean;
  initialPrompt: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    size_mb: number;
    estimated_duration_minutes: number;
    mime_type: string;
  };
}

const modelOptions = [
  { value: 'tiny', label: 'Tiny (Fastest, Lower Quality)', description: 'Best for quick processing' },
  { value: 'base', label: 'Base (Balanced)', description: 'Good balance of speed and quality' },
  { value: 'small', label: 'Small (Better Quality)', description: 'Higher quality, slower processing' },
  { value: 'medium', label: 'Medium (High Quality)', description: 'Best quality, slowest processing' },
];

const languageOptions = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];

export function AudioUploadModal({ isOpen, onClose, onUploadSuccess }: AudioUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [options, setOptions] = useState<UploadOptions>({
    meetingName: '',
    enableDiarization: true,
    model: 'base',
    language: 'auto',
    temperature: 0.0,
    beamSize: 5,
    wordTimestamps: true,
    initialPrompt: '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      
      // Auto-generate meeting name if not provided
      if (!options.meetingName) {
        const timestamp = new Date().toLocaleDateString();
        setOptions(prev => ({
          ...prev,
          meetingName: `Meeting - ${timestamp}`
        }));
      }

      // Validate file
      await validateFile(file);
    }
  }, [options.meetingName]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'],
      'video/*': ['.mp4', '.mov', '.avi']
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  const validateFile = async (file: File) => {
    try {
      setCurrentStep('Validating file...');
      
      // Simulate validation API call
      const mockValidation: ValidationResult = {
        valid: true,
        errors: [],
        warnings: file.size > 50 * 1024 * 1024 ? ['Large file - processing may take longer'] : [],
        metadata: {
          size_mb: file.size / (1024 * 1024),
          estimated_duration_minutes: Math.round((file.size / (1024 * 1024)) / 1.5), // Rough estimate
          mime_type: file.type
        }
      };

      // Add validation warnings/errors based on file
      if (file.size < 1024) {
        mockValidation.errors.push('File appears to be too small');
        mockValidation.valid = false;
      }

      setValidation(mockValidation);
      setCurrentStep('');
    } catch (error) {
      console.error('File validation failed:', error);
      setValidation({
        valid: false,
        errors: ['File validation failed'],
        warnings: [],
        metadata: { size_mb: 0, estimated_duration_minutes: 0, mime_type: '' }
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !validation?.valid) return;

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentStep('Preparing upload...');

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 200);

      setCurrentStep('Uploading file...');
      
      // Create FormData
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('meeting_name', options.meetingName);
      formData.append('enable_diarization', options.enableDiarization.toString());
      formData.append('model', options.model);
      formData.append('language', options.language);
      formData.append('temperature', options.temperature.toString());
      formData.append('beam_size', options.beamSize.toString());
      formData.append('word_timestamps', options.wordTimestamps.toString());
      if (options.initialPrompt) {
        formData.append('initial_prompt', options.initialPrompt);
      }

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setCurrentStep('Processing started!');

      // Mock successful response
      const mockJobId = `job_${Date.now()}`;
      const mockMeetingId = `meeting_${Date.now()}`;

      notify.success('Upload successful! Processing started.');
      onUploadSuccess(mockJobId, mockMeetingId);
      handleClose();

    } catch (error: any) {
      notify.apiError(error, {
        action: 'audio_upload',
        component: 'AudioUploadModal'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    
    setSelectedFile(null);
    setValidation(null);
    setOptions({
      meetingName: '',
      enableDiarization: true,
      model: 'base',
      language: 'auto',
      temperature: 0.0,
      beamSize: 5,
      wordTimestamps: true,
      initialPrompt: '',
    });
    setShowAdvanced(false);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const estimateProcessingTime = () => {
    if (!validation?.metadata) return '';
    
    const baseTimePerMB = options.model === 'tiny' ? 0.5 : 
                         options.model === 'base' ? 1 : 
                         options.model === 'small' ? 2 : 4;
    
    const diarizationMultiplier = options.enableDiarization ? 1.5 : 1;
    const estimatedMinutes = Math.ceil(validation.metadata.size_mb * baseTimePerMB * diarizationMultiplier);
    
    return `~${estimatedMinutes} minutes`;
  };

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <MicrophoneIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Upload Meeting Recording
                </h3>
                <p className="text-sm text-gray-600">
                  Upload an audio file for transcription and analysis
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Meeting Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Name
            </label>
            <input
              type="text"
              value={options.meetingName}
              onChange={(e) => setOptions(prev => ({ ...prev, meetingName: e.target.value }))}
              placeholder="Enter meeting name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUploading}
            />
          </div>

          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio File
            </label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                isDragActive && !isDragReject
                  ? 'border-blue-400 bg-blue-50'
                  : isDragReject
                  ? 'border-red-400 bg-red-50'
                  : selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} disabled={isUploading} />
              
              {selectedFile ? (
                <div className="space-y-3">
                  <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                    {validation?.metadata && (
                      <p className="text-xs text-gray-500">
                        ~{validation.metadata.estimated_duration_minutes} min duration
                      </p>
                    )}
                  </div>
                  {!isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setValidation(null);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Choose different file
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-600">
                      {isDragActive
                        ? 'Drop your audio file here'
                        : 'Drag and drop your audio file here, or click to browse'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Supports MP3, WAV, M4A, FLAC, OGG, WebM, MP4, MOV (max 100MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Validation Messages */}
            {validation && (
              <div className="mt-3 space-y-2">
                {validation.errors.map((error, index) => (
                  <div key={index} className="flex items-center space-x-2 text-red-600">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                  </div>
                ))}
                {validation.warnings.map((warning, index) => (
                  <div key={index} className="flex items-center space-x-2 text-yellow-600">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    <span className="text-sm">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Processing Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Processing Options</h4>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>
            
            {/* Basic Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model Quality
                </label>
                <select
                  value={options.model}
                  onChange={(e) => setOptions(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isUploading}
                >
                  {modelOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {modelOptions.find(opt => opt.value === options.model)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Language
                </label>
                <select
                  value={options.language}
                  onChange={(e) => setOptions(prev => ({ ...prev, language: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isUploading}
                >
                  {languageOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Speaker Diarization */}
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="diarization"
                checked={options.enableDiarization}
                onChange={(e) => setOptions(prev => ({ ...prev, enableDiarization: e.target.checked }))}
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={isUploading}
              />
              <div>
                <label htmlFor="diarization" className="text-sm font-medium text-gray-700">
                  Enable Speaker Diarization
                </label>
                <p className="text-xs text-gray-500">
                  Identify and separate different speakers in the recording
                </p>
              </div>
            </div>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temperature ({options.temperature})
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={options.temperature}
                      onChange={(e) => setOptions(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full"
                      disabled={isUploading}
                    />
                    <p className="text-xs text-gray-500">Lower = more consistent, Higher = more creative</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Beam Size
                    </label>
                    <select
                      value={options.beamSize}
                      onChange={(e) => setOptions(prev => ({ ...prev, beamSize: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isUploading}
                    >
                      <option value={1}>1 (Fastest)</option>
                      <option value={3}>3</option>
                      <option value={5}>5 (Balanced)</option>
                      <option value={7}>7 (Better Quality)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="wordTimestamps"
                    checked={options.wordTimestamps}
                    onChange={(e) => setOptions(prev => ({ ...prev, wordTimestamps: e.target.checked }))}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={isUploading}
                  />
                  <div>
                    <label htmlFor="wordTimestamps" className="text-sm font-medium text-gray-700">
                      Word-level Timestamps
                    </label>
                    <p className="text-xs text-gray-500">
                      Include precise timing for each word (recommended)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Prompt (Optional)
                  </label>
                  <textarea
                    value={options.initialPrompt}
                    onChange={(e) => setOptions(prev => ({ ...prev, initialPrompt: e.target.value }))}
                    placeholder="Provide context or keywords to improve transcription accuracy..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-500">
                    Help the AI understand context, names, or technical terms
                  </p>
                </div>
              </div>
            )}

            {/* Processing Estimate */}
            {selectedFile && validation?.valid && (
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <DocumentIcon className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Estimated Processing Time: {estimateProcessingTime()}
                    </p>
                    <p className="text-xs text-blue-700">
                      File: {formatFileSize(selectedFile.size)} • Model: {options.model} • Diarization: {options.enableDiarization ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{currentStep}</span>
                <span className="text-sm text-gray-500">{uploadProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !validation?.valid || isUploading || !options.meetingName.trim()}
            className="flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <LoadingSpinner size="sm" color="white" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <MicrophoneIcon className="w-4 h-4" />
                <span>Start Processing</span>
              </>
            )}
          </Button>
        </div>
      </div>
      </div>
    </ErrorBoundary>
  );
}