/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormFileUpload } from '../forms/FormFileUpload';

// Mock Heroicons
jest.mock('@heroicons/react/24/outline', () => ({
  CloudArrowUpIcon: ({ className }: { className?: string }) => (
    <div data-testid="cloud-upload-icon" className={className}>Upload Icon</div>
  ),
  DocumentIcon: ({ className }: { className?: string }) => (
    <div data-testid="document-icon" className={className}>Document Icon</div>
  ),
  XMarkIcon: ({ className }: { className?: string }) => (
    <div data-testid="x-mark-icon" className={className}>X Icon</div>
  ),
}));

describe('FormFileUpload', () => {
  const defaultProps = {
    onFileSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render basic file upload component', () => {
    render(<FormFileUpload {...defaultProps} />);
    
    expect(screen.getByTestId('cloud-upload-icon')).toBeInTheDocument();
    expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
  });

  it('should render with label and required indicator', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        label="Upload Files"
        required
      />
    );
    
    expect(screen.getByText('Upload Files')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('should render with error state', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        error="Please select a valid file"
      />
    );
    
    expect(screen.getByText('Please select a valid file')).toBeInTheDocument();
  });

  it('should render with help text', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        helpText="Select audio files up to 100MB"
      />
    );
    
    expect(screen.getByText('Select audio files up to 100MB')).toBeInTheDocument();
  });

  it('should display accepted formats when provided', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        accept=".mp3,.wav,.m4a"
      />
    );
    
    expect(screen.getByText('Accepted formats: .mp3,.wav,.m4a')).toBeInTheDocument();
  });

  it('should display maximum file size when provided', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        maxSize={100 * 1024 * 1024} // 100MB
      />
    );
    
    expect(screen.getByText('Maximum file size: 100 MB')).toBeInTheDocument();
  });

  it('should handle file selection via input', async () => {
    const onFileSelect = jest.fn();
    render(<FormFileUpload onFileSelect={onFileSelect} />);
    
    const file = new File(['content'], 'test.mp3', { type: 'audio/mp3' });
    const input = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.upload(input, file);
    
    expect(onFileSelect).toHaveBeenCalledWith([file]);
  });

  it('should handle multiple file selection', async () => {
    const onFileSelect = jest.fn();
    render(<FormFileUpload onFileSelect={onFileSelect} multiple />);
    
    const files = [
      new File(['content1'], 'test1.mp3', { type: 'audio/mp3' }),
      new File(['content2'], 'test2.wav', { type: 'audio/wav' }),
    ];
    
    const input = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.upload(input, files);
    
    expect(onFileSelect).toHaveBeenCalledWith(files);
  });

  it('should validate file size', async () => {
    const onFileSelect = jest.fn();
    render(
      <FormFileUpload
        onFileSelect={onFileSelect}
        maxSize={1024} // 1KB
      />
    );
    
    // Create a file larger than 1KB
    const largeFile = new File(['x'.repeat(2048)], 'large.mp3', { type: 'audio/mp3' });
    const input = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.upload(input, largeFile);
    
    // Should not call onFileSelect with invalid files
    expect(onFileSelect).toHaveBeenCalledWith([]);
  });

  it('should validate file types', async () => {
    const onFileSelect = jest.fn();
    render(
      <FormFileUpload
        onFileSelect={onFileSelect}
        allowedTypes={['audio/mp3', 'audio/wav']}
      />
    );
    
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    const validFile = new File(['content'], 'test.mp3', { type: 'audio/mp3' });
    
    const input = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.upload(input, [invalidFile, validFile]);
    
    // Should only call with valid files
    expect(onFileSelect).toHaveBeenCalledWith([validFile]);
  });

  it('should display selected files', () => {
    const files = [
      new File(['content'], 'test.mp3', { type: 'audio/mp3' }),
    ];
    
    render(
      <FormFileUpload
        {...defaultProps}
        files={files}
      />
    );
    
    expect(screen.getByText('Selected files:')).toBeInTheDocument();
    expect(screen.getByText('test.mp3')).toBeInTheDocument();
    expect(screen.getByTestId('document-icon')).toBeInTheDocument();
  });

  it('should handle file removal', async () => {
    const onFileRemove = jest.fn();
    const files = [
      new File(['content'], 'test.mp3', { type: 'audio/mp3' }),
    ];
    
    render(
      <FormFileUpload
        {...defaultProps}
        files={files}
        onFileRemove={onFileRemove}
      />
    );
    
    const removeButton = screen.getByTestId('x-mark-icon').parentElement as HTMLButtonElement;
    
    await userEvent.click(removeButton);
    
    expect(onFileRemove).toHaveBeenCalledWith(0);
  });

  it('should handle drag and drop', async () => {
    const onFileSelect = jest.fn();
    render(<FormFileUpload onFileSelect={onFileSelect} />);
    
    const dropzone = screen.getByRole('button');
    const file = new File(['content'], 'test.mp3', { type: 'audio/mp3' });
    
    // Simulate drag over
    fireEvent.dragOver(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });
    
    // Simulate drop
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });
    
    expect(onFileSelect).toHaveBeenCalledWith([file]);
  });

  it('should handle disabled state', () => {
    render(<FormFileUpload {...defaultProps} disabled />);
    
    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveClass('opacity-50', 'cursor-not-allowed');
    
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('should format file sizes correctly', () => {
    const files = [
      new File(['x'.repeat(1024)], 'test1.mp3', { type: 'audio/mp3' }), // ~1KB
      new File(['x'.repeat(1024 * 1024)], 'test2.mp3', { type: 'audio/mp3' }), // ~1MB
    ];
    
    render(
      <FormFileUpload
        {...defaultProps}
        files={files}
      />
    );
    
    expect(screen.getByText(/1 KB/)).toBeInTheDocument();
    expect(screen.getByText(/1 MB/)).toBeInTheDocument();
  });

  it('should apply custom classes', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        className="custom-class"
        containerClassName="container-class"
      />
    );
    
    const container = screen.getByRole('button').parentElement;
    expect(container).toHaveClass('container-class');
    
    const dropzone = screen.getByRole('button');
    expect(dropzone).toHaveClass('custom-class');
  });

  it('should handle custom placeholder text', () => {
    render(
      <FormFileUpload
        {...defaultProps}
        placeholder="Drop your audio files here"
      />
    );
    
    expect(screen.getByText('Drop your audio files here')).toBeInTheDocument();
  });

  it('should validate wildcard file types', async () => {
    const onFileSelect = jest.fn();
    render(
      <FormFileUpload
        onFileSelect={onFileSelect}
        allowedTypes={['audio/*']}
      />
    );
    
    const validFile = new File(['content'], 'test.mp3', { type: 'audio/mp3' });
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    
    const input = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;
    
    await userEvent.upload(input, [validFile, invalidFile]);
    
    expect(onFileSelect).toHaveBeenCalledWith([validFile]);
  });
});