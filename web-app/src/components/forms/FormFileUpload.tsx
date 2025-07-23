import { useCallback, useState, DragEvent, ChangeEvent } from 'react';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FormFieldError } from './FormError';

interface FormFileUploadProps {
  label?: string;
  error?: string | null;
  required?: boolean;
  helpText?: string;
  className?: string;
  containerClassName?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  onFileSelect: (files: File[]) => void;
  onFileRemove?: (index: number) => void;
  files?: File[];
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Standardized file upload component with drag-and-drop, validation, and error handling
 */
export function FormFileUpload({
  label,
  error,
  required,
  helpText,
  className = '',
  containerClassName = '',
  accept,
  multiple = false,
  maxSize,
  allowedTypes,
  onFileSelect,
  onFileRemove,
  files = [],
  disabled = false,
  placeholder = "Click to upload or drag and drop",
}: FormFileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const hasError = Boolean(error);

  const validateFiles = useCallback((fileList: File[]): { valid: File[], errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of fileList) {
      // Check file size
      if (maxSize && file.size > maxSize) {
        errors.push(`${file.name}: File size exceeds ${formatFileSize(maxSize)}`);
        continue;
      }

      // Check file type
      if (allowedTypes && allowedTypes.length > 0) {
        const isValidType = allowedTypes.some(type => {
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.slice(0, -1));
          }
          return file.type === type;
        });

        if (!isValidType) {
          errors.push(`${file.name}: Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
          continue;
        }
      }

      valid.push(file);
    }

    return { valid, errors };
  }, [maxSize, allowedTypes]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      const filesArray = Array.from(fileList);
      const { valid } = validateFiles(filesArray);
      onFileSelect(valid);
    }
  }, [validateFiles, onFileSelect]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const fileList = event.dataTransfer.files;
    if (fileList) {
      const filesArray = Array.from(fileList);
      const { valid } = validateFiles(filesArray);
      onFileSelect(valid);
    }
  }, [validateFiles, onFileSelect]);

  const removeFile = useCallback((index: number) => {
    if (onFileRemove) {
      onFileRemove(index);
    }
  }, [onFileRemove]);

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  };

  const dropzoneClasses = `
    relative border-2 border-dashed rounded-lg p-6 text-center hover:bg-gray-50 transition-colors
    ${isDragOver ? 'border-indigo-300 bg-indigo-50' : ''}
    ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-300'}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `.trim();

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium leading-6 text-gray-900">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className={label ? 'mt-2' : ''}>
        <div
          className={dropzoneClasses}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="sr-only"
            accept={accept}
            multiple={multiple}
            onChange={handleFileChange}
            disabled={disabled}
          />
          
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-900">
              {placeholder}
            </p>
            {accept && (
              <p className="text-xs text-gray-500 mt-1">
                Accepted formats: {accept}
              </p>
            )}
            {maxSize && (
              <p className="text-xs text-gray-500 mt-1">
                Maximum file size: {formatFileSize(maxSize)}
              </p>
            )}
          </div>
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-gray-900">Selected files:</p>
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div className="flex items-center space-x-3">
                  <DocumentIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                {onFileRemove && !disabled && (
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <FormFieldError error={error} className="mt-2" />}
        {helpText && !error && (
          <p className="mt-2 text-sm text-gray-500">{helpText}</p>
        )}
      </div>
    </div>
  );
}