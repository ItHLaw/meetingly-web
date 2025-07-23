'use client';

import { useState } from 'react';
import { 
  DocumentTextIcon, 
  BulbIcon, 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SpeakerWaveIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface KeyPoint {
  id: string;
  text: string;
  timestamp?: number;
  category: 'decision' | 'discussion' | 'question' | 'information';
}

interface SummaryData {
  meeting_id: string;
  overview: string;
  key_points: KeyPoint[];
  action_items: ActionItem[];
  participants: string[];
  topics_discussed: string[];
  sentiment_analysis?: {
    overall_sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
  };
  processing_metadata: {
    created_at: string;
    model_used: string;
    processing_time_seconds: number;
  };
}

interface SummaryDisplayProps {
  summary: SummaryData;
  isLoading?: boolean;
  className?: string;
  onActionItemUpdate?: (actionItem: ActionItem) => void;
  allowEditing?: boolean;
}

export function SummaryDisplay({
  summary,
  isLoading = false,
  className = '',
  onActionItemUpdate,
  allowEditing = false
}: SummaryDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview', 'key_points', 'action_items'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleActionItemToggle = (actionItem: ActionItem) => {
    if (!allowEditing) return;
    
    const updatedItem = { ...actionItem, completed: !actionItem.completed };
    onActionItemUpdate?.(updatedItem);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCategoryIcon = (category: KeyPoint['category']) => {
    switch (category) {
      case 'decision':
        return '✅';
      case 'discussion':
        return '💬';
      case 'question':
        return '❓';
      case 'information':
        return '📋';
      default:
        return '📝';
    }
  };

  const getPriorityColor = (priority: ActionItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'medium':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'low':
        return 'text-green-700 bg-green-50 border-green-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-700 bg-green-50';
      case 'negative':
        return 'text-red-700 bg-red-50';
      case 'neutral':
        return 'text-gray-700 bg-gray-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-gray-600">Generating summary...</p>
          </div>
        </div>
      </div>
    );
  }

  const CollapsibleSection = ({ 
    title, 
    sectionKey, 
    icon: Icon, 
    children, 
    badge 
  }: { 
    title: string; 
    sectionKey: string; 
    icon: any; 
    children: React.ReactNode; 
    badge?: number | string 
  }) => {
    const isExpanded = expandedSections.has(sectionKey);
    
    return (
      <div className="border border-gray-200 rounded-lg">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900">{title}</span>
            {badge && (
              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                {badge}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-500" />
          )}
        </button>
        
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <BulbIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Meeting Summary
              </h3>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>{summary.participants.length} participants</span>
                <span>{summary.topics_discussed.length} topics</span>
                <span>{summary.action_items.length} action items</span>
                {summary.sentiment_analysis && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(summary.sentiment_analysis.overall_sentiment)}`}>
                    {summary.sentiment_analysis.overall_sentiment} sentiment
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(summary.overview, 'Summary')}
            className="flex items-center space-x-2"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            <span>Copy</span>
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Overview */}
        <CollapsibleSection
          title="Overview"
          sectionKey="overview"
          icon={DocumentTextIcon}
        >
          <div className="mt-4">
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
              {summary.overview}
            </div>
          </div>
        </CollapsibleSection>

        {/* Key Points */}
        <CollapsibleSection
          title="Key Points"
          sectionKey="key_points"
          icon={BulbIcon}
          badge={summary.key_points.length}
        >
          <div className="mt-4 space-y-3">
            {summary.key_points.map((point) => (
              <div key={point.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-lg">{getCategoryIcon(point.category)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{point.text}</div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500 capitalize">
                      {point.category}
                    </span>
                    {point.timestamp && (
                      <span className="text-xs text-gray-500 font-mono">
                        @ {formatTime(point.timestamp)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Action Items */}
        <CollapsibleSection
          title="Action Items"
          sectionKey="action_items"
          icon={CheckCircleIcon}
          badge={summary.action_items.filter(item => !item.completed).length}
        >
          <div className="mt-4 space-y-3">
            {summary.action_items.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <CheckCircleIcon className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm">No action items identified</p>
              </div>
            ) : (
              summary.action_items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start space-x-3 p-3 border rounded-lg transition-colors ${
                    item.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                  }`}
                >
                  <button
                    onClick={() => handleActionItemToggle(item)}
                    disabled={!allowEditing}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      item.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${!allowEditing ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    {item.completed && <CheckCircleIcon className="w-3 h-3" />}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${item.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {item.text}
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 text-xs rounded-full border ${getPriorityColor(item.priority)}`}>
                        {item.priority} priority
                      </span>
                      {item.assignee && (
                        <span className="text-xs text-gray-600">
                          Assigned to {item.assignee}
                        </span>
                      )}
                      {item.due_date && (
                        <span className="text-xs text-gray-600">
                          Due {new Date(item.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>

        {/* Participants & Topics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CollapsibleSection
            title="Participants"
            sectionKey="participants"
            icon={SpeakerWaveIcon}
            badge={summary.participants.length}
          >
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {summary.participants.map((participant, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                  >
                    {participant}
                  </span>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Topics Discussed"
            sectionKey="topics"
            icon={DocumentTextIcon}
            badge={summary.topics_discussed.length}
          >
            <div className="mt-4">
              <div className="space-y-2">
                {summary.topics_discussed.map((topic, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    <span className="text-sm text-gray-700">{topic}</span>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Processing Metadata */}
        <CollapsibleSection
          title="Processing Details"
          sectionKey="metadata"
          icon={ExclamationTriangleIcon}
        >
          <div className="mt-4 text-sm text-gray-600 space-y-2">
            <div>
              <span className="font-medium">Generated:</span>
              <span className="ml-2">{new Date(summary.processing_metadata.created_at).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium">Model:</span>
              <span className="ml-2">{summary.processing_metadata.model_used}</span>
            </div>
            <div>
              <span className="font-medium">Processing Time:</span>
              <span className="ml-2">{summary.processing_metadata.processing_time_seconds}s</span>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}