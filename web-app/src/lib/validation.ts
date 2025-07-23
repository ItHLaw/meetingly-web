/**
 * Form validation utilities for consistent error handling
 */

export interface ValidationRule<T = any> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationSchema {
  [fieldName: string]: ValidationRule[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  firstError?: string;
}

/**
 * Common validation rules
 */
export const ValidationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    validate: (value: any) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value: string) => !value || value.length >= min,
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value: string) => !value || value.length <= max,
    message: message || `Must be no more than ${max} characters`,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    validate: (value: string) => {
      if (!value) return true; // Allow empty if not required
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  fileRequired: (message = 'Please select a file'): ValidationRule => ({
    validate: (file: File | null) => file !== null,
    message,
  }),

  fileSize: (maxSizeBytes: number, message?: string): ValidationRule => ({
    validate: (file: File | null) => {
      if (!file) return true;
      return file.size <= maxSizeBytes;
    },
    message: message || `File size must be less than ${formatFileSize(maxSizeBytes)}`,
  }),

  fileType: (allowedTypes: string[], message?: string): ValidationRule => ({
    validate: (file: File | null) => {
      if (!file) return true;
      return allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      });
    },
    message: message || `File type must be: ${allowedTypes.join(', ')}`,
  }),

  number: (message = 'Must be a valid number'): ValidationRule => ({
    validate: (value: any) => {
      if (value === '' || value === null || value === undefined) return true;
      return !isNaN(Number(value));
    },
    message,
  }),

  min: (min: number, message?: string): ValidationRule => ({
    validate: (value: any) => {
      if (value === '' || value === null || value === undefined) return true;
      return Number(value) >= min;
    },
    message: message || `Must be at least ${min}`,
  }),

  max: (max: number, message?: string): ValidationRule => ({
    validate: (value: any) => {
      if (value === '' || value === null || value === undefined) return true;
      return Number(value) <= max;
    },
    message: message || `Must be no more than ${max}`,
  }),

  custom: (validator: (value: any) => boolean, message: string): ValidationRule => ({
    validate: validator,
    message,
  }),
};

/**
 * Validate a single field against multiple rules
 */
export function validateField(value: any, rules: ValidationRule[]): string[] {
  const errors: string[] = [];
  
  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }
  
  return errors;
}

/**
 * Validate multiple fields against a schema
 */
export function validateForm(data: Record<string, any>, schema: ValidationSchema): ValidationResult {
  const errors: Record<string, string[]> = {};
  let isValid = true;
  let firstError: string | undefined;

  for (const [fieldName, rules] of Object.entries(schema)) {
    const fieldErrors = validateField(data[fieldName], rules);
    
    if (fieldErrors.length > 0) {
      errors[fieldName] = fieldErrors;
      isValid = false;
      
      if (!firstError) {
        firstError = fieldErrors[0];
      }
    }
  }

  return { isValid, errors, firstError };
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
}

/**
 * Hook for form validation with real-time feedback
 */
import { useState, useCallback, useMemo } from 'react';

export interface UseFormValidationOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  schema: ValidationSchema;
  initialData?: Record<string, any>;
}

export function useFormValidation({
  validateOnChange = false,
  validateOnBlur = true,
  schema,
  initialData = {},
}: UseFormValidationOptions) {
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateSingleField = useCallback((fieldName: string, value: any) => {
    if (!schema[fieldName]) return [];
    return validateField(value, schema[fieldName]);
  }, [schema]);

  const validateAllFields = useCallback(() => {
    return validateForm(data, schema);
  }, [data, schema]);

  const updateField = useCallback((fieldName: string, value: any) => {
    setData(prev => ({ ...prev, [fieldName]: value }));

    if (validateOnChange) {
      const fieldErrors = validateSingleField(fieldName, value);
      setErrors(prev => ({ ...prev, [fieldName]: fieldErrors }));
    }
  }, [validateOnChange, validateSingleField]);

  const touchField = useCallback((fieldName: string) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));

    if (validateOnBlur) {
      const fieldErrors = validateSingleField(fieldName, data[fieldName]);
      setErrors(prev => ({ ...prev, [fieldName]: fieldErrors }));
    }
  }, [validateOnBlur, validateSingleField, data]);

  const getFieldError = useCallback((fieldName: string): string | null => {
    const fieldErrors = errors[fieldName];
    if (!fieldErrors || fieldErrors.length === 0) return null;
    return fieldErrors[0]; // Return first error
  }, [errors]);

  const hasFieldError = useCallback((fieldName: string): boolean => {
    return Boolean(errors[fieldName]?.length);
  }, [errors]);

  const isFieldTouched = useCallback((fieldName: string): boolean => {
    return Boolean(touched[fieldName]);
  }, [touched]);

  const clearErrors = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  const validation = useMemo(() => validateAllFields(), [validateAllFields]);

  return {
    data,
    errors,
    touched,
    validation,
    updateField,
    touchField,
    getFieldError,
    hasFieldError,
    isFieldTouched,
    clearErrors,
    validateAllFields,
    setData,
  };
}