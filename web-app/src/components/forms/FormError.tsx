import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { ReactNode } from 'react';

interface FormErrorProps {
  error: string | string[] | null | undefined;
  className?: string;
}

interface FormFieldErrorProps {
  error: string | null | undefined;
  fieldName?: string;
  className?: string;
}

interface FormErrorSummaryProps {
  errors: Record<string, string | string[]>;
  title?: string;
  className?: string;
}

/**
 * Display a single form error with consistent styling
 */
export function FormError({ error, className = '' }: FormErrorProps) {
  if (!error) return null;

  const errorMessages = Array.isArray(error) ? error : [error];

  return (
    <div className={`flex items-start gap-2 text-sm text-red-600 ${className}`}>
      <ExclamationCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="space-y-1">
        {errorMessages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
    </div>
  );
}

/**
 * Display field-specific error with consistent styling and accessibility
 */
export function FormFieldError({ error, fieldName, className = '' }: FormFieldErrorProps) {
  if (!error) return null;

  const errorId = fieldName ? `${fieldName}-error` : undefined;

  return (
    <div 
      id={errorId}
      className={`mt-1 flex items-start gap-2 text-sm text-red-600 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <ExclamationCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{error}</span>
    </div>
  );
}

/**
 * Display a summary of all form errors
 */
export function FormErrorSummary({ 
  errors, 
  title = "Please fix the following errors:", 
  className = '' 
}: FormErrorSummaryProps) {
  const errorEntries = Object.entries(errors).filter(([_, error]) => error);
  
  if (errorEntries.length === 0) return null;

  return (
    <div className={`rounded-md bg-red-50 p-4 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <ExclamationCircleIcon className="h-5 w-5 text-red-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <div className="mt-2 text-sm text-red-700">
            <ul className="list-disc space-y-1 pl-5">
              {errorEntries.map(([field, error]) => {
                const errorMessages = Array.isArray(error) ? error : [error];
                return errorMessages.map((msg, index) => (
                  <li key={`${field}-${index}`}>
                    <span className="font-medium capitalize">{field.replace('_', ' ')}:</span> {msg}
                  </li>
                ));
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Success message component for consistent success feedback
 */
interface FormSuccessProps {
  message: string | null | undefined;
  className?: string;
}

export function FormSuccess({ message, className = '' }: FormSuccessProps) {
  if (!message) return null;

  return (
    <div className={`flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md ${className}`}>
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <span>{message}</span>
    </div>
  );
}