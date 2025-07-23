import { Meeting, SummaryData } from '@/types';

export type ExportFormat = 'markdown' | 'pdf' | 'html';

interface ExportOptions {
  includeTranscript?: boolean;
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
}

export class ExportService {
  /**
   * Generate markdown content from meeting data
   */
  static generateMarkdown(meeting: Meeting, options: ExportOptions = {}): string {
    const { includeTranscript = true, includeMetadata = true, includeTimestamps = false } = options;
    
    let markdown = `# ${meeting.title}\n\n`;
    
    if (includeMetadata) {
      markdown += `## Meeting Information\n\n`;
      markdown += `- **Date**: ${new Date(meeting.created_at).toLocaleString()}\n`;
      markdown += `- **Status**: ${meeting.processing_status}\n`;
      if (meeting.updated_at !== meeting.created_at) {
        markdown += `- **Last Updated**: ${new Date(meeting.updated_at).toLocaleString()}\n`;
      }
      markdown += '\n';
    }
    
    // Add AI Summary if available
    if (meeting.summary_data) {
      markdown += this.generateSummaryMarkdown(meeting.summary_data);
    }
    
    // Add transcript if available and requested
    if (includeTranscript && meeting.transcript_text) {
      markdown += `## Transcript\n\n`;
      if (includeTimestamps) {
        // If we have structured transcript data with timestamps, use it
        // For now, just add the raw text
        markdown += meeting.transcript_text;
      } else {
        markdown += meeting.transcript_text;
      }
      markdown += '\n\n';
    }
    
    return markdown;
  }
  
  /**
   * Generate HTML content from meeting data
   */
  static generateHTML(meeting: Meeting, options: ExportOptions = {}): string {
    const { includeTranscript = true, includeMetadata = true, includeTimestamps = false } = options;
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${meeting.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            color: #333;
        }
        h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
        h2 { color: #4f46e5; margin-top: 2rem; }
        h3 { color: #6366f1; }
        .metadata { background: #f8fafc; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; }
        .summary-section { margin: 1.5rem 0; }
        .transcript { background: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; }
        .bullet-list { margin: 0.5rem 0; }
        .bullet-list li { margin: 0.25rem 0; }
        @media print {
            body { margin: 0; padding: 1rem; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <h1>${meeting.title}</h1>`;
    
    if (includeMetadata) {
      html += `
    <div class="metadata">
        <h2>Meeting Information</h2>
        <p><strong>Date:</strong> ${new Date(meeting.created_at).toLocaleString()}</p>
        <p><strong>Status:</strong> ${meeting.processing_status}</p>`;
      if (meeting.updated_at !== meeting.created_at) {
        html += `<p><strong>Last Updated:</strong> ${new Date(meeting.updated_at).toLocaleString()}</p>`;
      }
      html += `</div>`;
    }
    
    // Add AI Summary if available
    if (meeting.summary_data) {
      html += this.generateSummaryHTML(meeting.summary_data);
    }
    
    // Add transcript if available and requested
    if (includeTranscript && meeting.transcript_text) {
      html += `
    <div class="transcript">
        <h2>Transcript</h2>
        <pre>${meeting.transcript_text}</pre>
    </div>`;
    }
    
    html += `
</body>
</html>`;
    
    return html;
  }
  
  /**
   * Generate summary markdown from summary data
   */
  private static generateSummaryMarkdown(summaryData: SummaryData): string {
    let markdown = `## AI Summary\n\n`;
    
    if (summaryData.summary) {
      markdown += `### Overview\n\n${summaryData.summary}\n\n`;
    }
    
    if (summaryData.key_points && summaryData.key_points.length > 0) {
      markdown += `### Key Points\n\n`;
      summaryData.key_points.forEach(point => {
        markdown += `- ${point}\n`;
      });
      markdown += '\n';
    }
    
    if (summaryData.action_items && summaryData.action_items.length > 0) {
      markdown += `### Action Items\n\n`;
      summaryData.action_items.forEach(item => {
        markdown += `- [ ] ${item}\n`;
      });
      markdown += '\n';
    }
    
    if (summaryData.participants && summaryData.participants.length > 0) {
      markdown += `### Participants\n\n`;
      summaryData.participants.forEach(participant => {
        markdown += `- ${participant}\n`;
      });
      markdown += '\n';
    }
    
    return markdown;
  }
  
  /**
   * Generate summary HTML from summary data
   */
  private static generateSummaryHTML(summaryData: SummaryData): string {
    let html = `<div class="summary-section"><h2>AI Summary</h2>`;
    
    if (summaryData.summary) {
      html += `<div class="summary-section">
        <h3>Overview</h3>
        <p>${summaryData.summary}</p>
      </div>`;
    }
    
    if (summaryData.key_points && summaryData.key_points.length > 0) {
      html += `<div class="summary-section">
        <h3>Key Points</h3>
        <ul class="bullet-list">`;
      summaryData.key_points.forEach(point => {
        html += `<li>${point}</li>`;
      });
      html += `</ul></div>`;
    }
    
    if (summaryData.action_items && summaryData.action_items.length > 0) {
      html += `<div class="summary-section">
        <h3>Action Items</h3>
        <ul class="bullet-list">`;
      summaryData.action_items.forEach(item => {
        html += `<li><input type="checkbox" disabled> ${item}</li>`;
      });
      html += `</ul></div>`;
    }
    
    if (summaryData.participants && summaryData.participants.length > 0) {
      html += `<div class="summary-section">
        <h3>Participants</h3>
        <ul class="bullet-list">`;
      summaryData.participants.forEach(participant => {
        html += `<li>${participant}</li>`;
      });
      html += `</ul></div>`;
    }
    
    html += `</div>`;
    return html;
  }
  
  /**
   * Download file with given content and filename
   */
  static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Export meeting as markdown file
   */
  static exportAsMarkdown(meeting: Meeting, options: ExportOptions = {}): void {
    const content = this.generateMarkdown(meeting, options);
    const filename = `${meeting.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    this.downloadFile(content, filename, 'text/markdown');
  }
  
  /**
   * Export meeting as HTML file
   */
  static exportAsHTML(meeting: Meeting, options: ExportOptions = {}): void {
    const content = this.generateHTML(meeting, options);
    const filename = `${meeting.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    this.downloadFile(content, filename, 'text/html');
  }
  
  /**
   * Export meeting as PDF (using print API)
   */
  static exportAsPDF(meeting: Meeting, options: ExportOptions = {}): void {
    const html = this.generateHTML(meeting, options);
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Please allow popups to export as PDF');
      return;
    }
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      // Close window after a delay to allow printing dialog
      setTimeout(() => {
        printWindow.close();
      }, 1000);
    };
  }
  
  /**
   * Copy meeting content to clipboard as markdown
   */
  static async copyAsMarkdown(meeting: Meeting, options: ExportOptions = {}): Promise<void> {
    const content = this.generateMarkdown(meeting, options);
    await navigator.clipboard.writeText(content);
  }
}