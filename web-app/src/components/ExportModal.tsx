'use client';

import { useState } from 'react';
import { Meeting } from '@/types';
import { ExportService, ExportFormat } from '@/services/exportService';
import { Button } from '@/components/ui/button';
import { notify } from '@/services/notificationService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting;
}

interface ExportOptions {
  includeTranscript: boolean;
  includeMetadata: boolean;
  includeTimestamps: boolean;
}

export function ExportModal({ isOpen, onClose, meeting }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [options, setOptions] = useState<ExportOptions>({
    includeTranscript: true,
    includeMetadata: true,
    includeTimestamps: false,
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!meeting) return;

    setIsExporting(true);
    try {
      switch (selectedFormat) {
        case 'markdown':
          ExportService.exportAsMarkdown(meeting, options);
          break;
        case 'html':
          ExportService.exportAsHTML(meeting, options);
          break;
        case 'pdf':
          ExportService.exportAsPDF(meeting, options);
          break;
        default:
          throw new Error('Invalid export format');
      }
      
      // Close modal after successful export
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      notify.apiError(error, {
        action: 'meeting_export',
        component: 'ExportModal'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!meeting) return;

    try {
      await ExportService.copyAsMarkdown(meeting, options);
      notify.success('Meeting content copied to clipboard!');
    } catch (error) {
      notify.apiError(error, {
        action: 'copy_to_clipboard',
        component: 'ExportModal'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Export Meeting
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
            Export "{meeting.title}" in your preferred format
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedFormat('markdown')}
                className={`px-3 py-2 text-sm rounded-md border ${
                  selectedFormat === 'markdown'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                📝 Markdown
              </button>
              <button
                onClick={() => setSelectedFormat('html')}
                className={`px-3 py-2 text-sm rounded-md border ${
                  selectedFormat === 'html'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                🌐 HTML
              </button>
              <button
                onClick={() => setSelectedFormat('pdf')}
                className={`px-3 py-2 text-sm rounded-md border ${
                  selectedFormat === 'pdf'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                📄 PDF
              </button>
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Include Content
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.includeMetadata}
                  onChange={(e) => setOptions(prev => ({ ...prev, includeMetadata: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Meeting metadata (date, status, etc.)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.includeTranscript}
                  onChange={(e) => setOptions(prev => ({ ...prev, includeTranscript: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={!meeting.transcript_text}
                />
                <span className={`ml-2 text-sm ${!meeting.transcript_text ? 'text-gray-400' : 'text-gray-700'}`}>
                  Transcript {!meeting.transcript_text && '(not available)'}
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.includeTimestamps}
                  onChange={(e) => setOptions(prev => ({ ...prev, includeTimestamps: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={!options.includeTranscript || !meeting.transcript_text}
                />
                <span className={`ml-2 text-sm ${!options.includeTranscript || !meeting.transcript_text ? 'text-gray-400' : 'text-gray-700'}`}>
                  Timestamps {(!options.includeTranscript || !meeting.transcript_text) && '(requires transcript)'}
                </span>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 p-3 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <div>• Title: {meeting.title}</div>
              {options.includeMetadata && (
                <div>• Metadata: Date, status, duration</div>
              )}
              {meeting.summary_data && (
                <div>• AI Summary: Key points, action items, participants</div>
              )}
              {options.includeTranscript && meeting.transcript_text && (
                <div>• Transcript: Full meeting transcript</div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            className="text-sm"
          >
            📋 Copy to Clipboard
          </Button>
          
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="text-sm"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  📥 Export
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}