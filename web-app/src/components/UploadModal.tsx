'use client';

import { useState } from 'react';
import { audioAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/forms/FormError';
import { useUploadRetry } from '@/hooks/useRetry';
import { notify } from '@/services/notificationService';
import { formatErrorForUI } from '@/lib/errorHandling';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (jobId: string, meetingId: string) => void;
}

interface UploadOptions {
  enableDiarization: boolean;
  model: string;
  language: string;
}

export function UploadModal({ isOpen, onClose, onUploadSuccess }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<UploadOptions>({
    enableDiarization: true,
    model: 'base',
    language: 'auto',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { executeWithRetry } = useUploadRetry({
    onRetryError: (error, attempt) => {
      console.warn(`Upload failed (attempt ${attempt}):`, error.message);
    }
  });

  const handleFileSelect = (file: File) => {
    setError(null); // Clear previous errors
    
    // Validate file type
    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    
    try {
      const response = await executeWithRetry(() => audioAPI.upload(selectedFile, options));
      const { job_id, meeting_id } = response.data;
      
      onUploadSuccess(job_id, meeting_id);
      onClose();
      
      // Reset form
      setSelectedFile(null);
      setError(null);
      setOptions({
        enableDiarization: true,
        model: 'base',
        language: 'auto',
      });
    } catch (error: any) {
      const uiError = notify.apiError(error, {
        action: 'file_upload',
        component: 'UploadModal',
        showNotification: false
      });
      setError(uiError.message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Upload Meeting Recording
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Upload an audio file to transcribe and analyze
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive
                ? 'border-blue-400 bg-blue-50'
                : selectedFile
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {selectedFile ? (
              <div className="space-y-2">
                <div className="text-green-600">
                  <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-gray-400">
                  <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600">
                  Drag and drop your audio file here, or{' '}
                  <label className="text-blue-600 hover:text-blue-800 cursor-pointer">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      accept="audio/*"
                      onChange={handleFileChange}
                    />
                  </label>
                </p>
                <p className="text-xs text-gray-500">
                  Supports MP3, WAV, M4A, FLAC (max 50MB)
                </p>
              </div>
            )}
          </div>

          {/* Processing Options */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Processing Options</h4>
            
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.enableDiarization}
                  onChange={(e) => setOptions(prev => ({ ...prev, enableDiarization: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Enable speaker diarization
                </span>
              </label>
              <p className="text-xs text-gray-500 ml-6">
                Identify different speakers in the recording
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Model Quality
                </label>
                <select
                  value={options.model}
                  onChange={(e) => setOptions(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="tiny">Tiny (fastest)</option>
                  <option value="base">Base (balanced)</option>
                  <option value="small">Small (better)</option>
                  <option value="medium">Medium (best)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Language
                </label>
                <select
                  value={options.language}
                  onChange={(e) => setOptions(prev => ({ ...prev, language: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Error Display */}
          {error && (
            <FormError error={error} className="mt-4" />
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploading}
            className="text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="text-sm"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                🎙️ Start Processing
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}