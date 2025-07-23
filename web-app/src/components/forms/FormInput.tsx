import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { FormFieldError } from './FormError';

interface BaseFormFieldProps {
  label?: string;
  error?: string | null;
  required?: boolean;
  helpText?: string;
  className?: string;
  containerClassName?: string;
}

interface FormInputProps extends BaseFormFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {}
interface FormTextareaProps extends BaseFormFieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {}
interface FormSelectProps extends BaseFormFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  placeholder?: string;
}

/**
 * Standardized text input with error handling
 */
export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, required, helpText, className = '', containerClassName = '', ...props }, ref) => {
    const inputId = props.id || props.name;
    const hasError = Boolean(error);
    
    const inputClasses = `
      block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset 
      placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
      ${hasError 
        ? 'ring-red-300 focus:ring-red-500 text-red-900 placeholder:text-red-300' 
        : 'ring-gray-300 focus:ring-indigo-600'
      }
      ${props.disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
      ${className}
    `.trim();

    return (
      <div className={containerClassName}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium leading-6 text-gray-900">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className={label ? 'mt-2' : ''}>
          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
            {...props}
          />
          {error && <FormFieldError error={error} fieldName={inputId} />}
          {helpText && !error && (
            <p id={`${inputId}-help`} className="mt-2 text-sm text-gray-500">
              {helpText}
            </p>
          )}
        </div>
      </div>
    );
  }
);

FormInput.displayName = 'FormInput';

/**
 * Standardized textarea with error handling
 */
export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, error, required, helpText, className = '', containerClassName = '', rows = 3, ...props }, ref) => {
    const inputId = props.id || props.name;
    const hasError = Boolean(error);
    
    const textareaClasses = `
      block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset 
      placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
      ${hasError 
        ? 'ring-red-300 focus:ring-red-500 text-red-900 placeholder:text-red-300' 
        : 'ring-gray-300 focus:ring-indigo-600'
      }
      ${props.disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
      ${className}
    `.trim();

    return (
      <div className={containerClassName}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium leading-6 text-gray-900">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className={label ? 'mt-2' : ''}>
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            className={textareaClasses}
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
            {...props}
          />
          {error && <FormFieldError error={error} fieldName={inputId} />}
          {helpText && !error && (
            <p id={`${inputId}-help`} className="mt-2 text-sm text-gray-500">
              {helpText}
            </p>
          )}
        </div>
      </div>
    );
  }
);

FormTextarea.displayName = 'FormTextarea';

/**
 * Standardized select with error handling
 */
export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, error, required, helpText, className = '', containerClassName = '', options, placeholder, ...props }, ref) => {
    const inputId = props.id || props.name;
    const hasError = Boolean(error);
    
    const selectClasses = `
      block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset 
      focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
      ${hasError 
        ? 'ring-red-300 focus:ring-red-500 text-red-900' 
        : 'ring-gray-300 focus:ring-indigo-600'
      }
      ${props.disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
      ${className}
    `.trim();

    return (
      <div className={containerClassName}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium leading-6 text-gray-900">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className={label ? 'mt-2' : ''}>
          <select
            ref={ref}
            id={inputId}
            className={selectClasses}
            aria-invalid={hasError}
            aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option 
                key={option.value} 
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          {error && <FormFieldError error={error} fieldName={inputId} />}
          {helpText && !error && (
            <p id={`${inputId}-help`} className="mt-2 text-sm text-gray-500">
              {helpText}
            </p>
          )}
        </div>
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';

/**
 * Checkbox with error handling
 */
interface FormCheckboxProps extends BaseFormFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  description?: string;
}

export const FormCheckbox = forwardRef<HTMLInputElement, FormCheckboxProps>(
  ({ label, error, required, helpText, description, className = '', containerClassName = '', ...props }, ref) => {
    const inputId = props.id || props.name;
    const hasError = Boolean(error);

    return (
      <div className={containerClassName}>
        <div className="relative flex items-start">
          <div className="flex h-6 items-center">
            <input
              ref={ref}
              id={inputId}
              type="checkbox"
              className={`
                h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600
                ${hasError ? 'border-red-300 text-red-600 focus:ring-red-600' : ''}
                ${props.disabled ? 'cursor-not-allowed opacity-50' : ''}
                ${className}
              `.trim()}
              aria-invalid={hasError}
              aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
              {...props}
            />
          </div>
          <div className="ml-3 text-sm leading-6">
            {label && (
              <label htmlFor={inputId} className="font-medium text-gray-900">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
              </label>
            )}
            {description && (
              <p className="text-gray-500">{description}</p>
            )}
          </div>
        </div>
        {error && <FormFieldError error={error} fieldName={inputId} className="mt-2" />}
        {helpText && !error && (
          <p id={`${inputId}-help`} className="mt-2 text-sm text-gray-500">
            {helpText}
          </p>
        )}
      </div>
    );
  }
);

FormCheckbox.displayName = 'FormCheckbox';