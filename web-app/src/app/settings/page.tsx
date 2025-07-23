'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  CogIcon,
  MicrophoneIcon,
  BellIcon,
  UserIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  CloudIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface SettingsData {
  // User Preferences
  language: string;
  timezone: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'system';
  
  // Audio Processing
  defaultModel: string;
  defaultLanguage: string;
  enableDiarization: boolean;
  audioQuality: string;
  enableWordTimestamps: boolean;
  
  // Notifications
  emailNotifications: boolean;
  processCompleteNotifications: boolean;
  weeklyDigest: boolean;
  browserNotifications: boolean;
  
  // Privacy & Security
  dataRetention: number; // days
  enableEncryption: boolean;
  allowSharing: boolean;
  requirePasswordForSharing: boolean;
  
  // Export & Integration
  defaultExportFormat: string;
  autoExportEnabled: boolean;
  integrationSettings: {
    slack: boolean;
    teams: boolean;
    email: boolean;
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({
    // User Preferences
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'MM/DD/YYYY',
    theme: 'system',
    
    // Audio Processing
    defaultModel: 'base',
    defaultLanguage: 'auto',
    enableDiarization: true,
    audioQuality: 'standard',
    enableWordTimestamps: true,
    
    // Notifications
    emailNotifications: true,
    processCompleteNotifications: true,
    weeklyDigest: false,
    browserNotifications: true,
    
    // Privacy & Security
    dataRetention: 90,
    enableEncryption: true,
    allowSharing: true,
    requirePasswordForSharing: false,
    
    // Export & Integration
    defaultExportFormat: 'pdf',
    autoExportEnabled: false,
    integrationSettings: {
      slack: false,
      teams: false,
      email: true,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeSection, setActiveSection] = useState('general');

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        newSettings[parent as keyof SettingsData] = {
          ...(newSettings[parent as keyof SettingsData] as any),
          [child]: value
        };
      } else {
        (newSettings as any)[key] = value;
      }
      return newSettings;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In real implementation, this would save to API
      console.log('Saving settings:', settings);
      
      setHasChanges(false);
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      // Reset to defaults
      setSettings({
        language: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateFormat: 'MM/DD/YYYY',
        theme: 'system',
        defaultModel: 'base',
        defaultLanguage: 'auto',
        enableDiarization: true,
        audioQuality: 'standard',
        enableWordTimestamps: true,
        emailNotifications: true,
        processCompleteNotifications: true,
        weeklyDigest: false,
        browserNotifications: true,
        dataRetention: 90,
        enableEncryption: true,
        allowSharing: true,
        requirePasswordForSharing: false,
        defaultExportFormat: 'pdf',
        autoExportEnabled: false,
        integrationSettings: {
          slack: false,
          teams: false,
          email: true,
        },
      });
      setHasChanges(true);
      toast.success('Settings reset to defaults');
    }
  };

  const sections = [
    { id: 'general', name: 'General', icon: CogIcon },
    { id: 'audio', name: 'Audio Processing', icon: MicrophoneIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'privacy', name: 'Privacy & Security', icon: ShieldCheckIcon },
    { id: 'export', name: 'Export & Integration', icon: CloudIcon },
  ];

  const SettingItem = ({ 
    label, 
    description, 
    children 
  }: { 
    label: string; 
    description?: string; 
    children: React.ReactNode 
  }) => (
    <div className="py-4 border-b border-gray-200 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-4">
          <label className="text-sm font-medium text-gray-900">
            {label}
          </label>
          {description && (
            <p className="text-sm text-gray-500 mt-1">
              {description}
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          {children}
        </div>
      </div>
    </div>
  );

  const renderGeneralSettings = () => (
    <div className="space-y-0">
      <SettingItem
        label="Language"
        description="Choose your preferred language for the interface"
      >
        <select
          value={settings.language}
          onChange={(e) => handleSettingChange('language', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Timezone"
        description="Your local timezone for date and time display"
      >
        <select
          value={settings.timezone}
          onChange={(e) => handleSettingChange('timezone', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="America/New_York">Eastern Time</option>
          <option value="America/Chicago">Central Time</option>
          <option value="America/Denver">Mountain Time</option>
          <option value="America/Los_Angeles">Pacific Time</option>
          <option value="UTC">UTC</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Date Format"
        description="How dates are displayed throughout the application"
      >
        <select
          value={settings.dateFormat}
          onChange={(e) => handleSettingChange('dateFormat', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Theme"
        description="Choose your preferred color scheme"
      >
        <select
          value={settings.theme}
          onChange={(e) => handleSettingChange('theme', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </SettingItem>
    </div>
  );

  const renderAudioSettings = () => (
    <div className="space-y-0">
      <SettingItem
        label="Default Model"
        description="Default Whisper model for transcription"
      >
        <select
          value={settings.defaultModel}
          onChange={(e) => handleSettingChange('defaultModel', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="tiny">Tiny (Fastest)</option>
          <option value="base">Base (Balanced)</option>
          <option value="small">Small (Better Quality)</option>
          <option value="medium">Medium (Best Quality)</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Default Language"
        description="Default language detection for new recordings"
      >
        <select
          value={settings.defaultLanguage}
          onChange={(e) => handleSettingChange('defaultLanguage', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="auto">Auto-detect</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Speaker Diarization"
        description="Automatically identify different speakers in recordings"
      >
        <button
          onClick={() => handleSettingChange('enableDiarization', !settings.enableDiarization)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enableDiarization ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enableDiarization ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Word-level Timestamps"
        description="Include precise timing for each word (recommended)"
      >
        <button
          onClick={() => handleSettingChange('enableWordTimestamps', !settings.enableWordTimestamps)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enableWordTimestamps ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enableWordTimestamps ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Audio Quality"
        description="Processing quality vs speed tradeoff"
      >
        <select
          value={settings.audioQuality}
          onChange={(e) => handleSettingChange('audioQuality', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="draft">Draft (Fastest)</option>
          <option value="standard">Standard</option>
          <option value="high">High Quality</option>
        </select>
      </SettingItem>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-0">
      <SettingItem
        label="Email Notifications"
        description="Receive notifications via email"
      >
        <button
          onClick={() => handleSettingChange('emailNotifications', !settings.emailNotifications)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.emailNotifications ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.emailNotifications ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Processing Complete"
        description="Notify when transcription and analysis is complete"
      >
        <button
          onClick={() => handleSettingChange('processCompleteNotifications', !settings.processCompleteNotifications)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.processCompleteNotifications ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.processCompleteNotifications ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Weekly Digest"
        description="Receive a weekly summary of your meetings"
      >
        <button
          onClick={() => handleSettingChange('weeklyDigest', !settings.weeklyDigest)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.weeklyDigest ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.weeklyDigest ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Browser Notifications"
        description="Show notifications in your browser"
      >
        <button
          onClick={() => handleSettingChange('browserNotifications', !settings.browserNotifications)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.browserNotifications ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.browserNotifications ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>
    </div>
  );

  const renderPrivacySettings = () => (
    <div className="space-y-0">
      <SettingItem
        label="Data Retention"
        description="How long to keep your meeting data (in days)"
      >
        <select
          value={settings.dataRetention}
          onChange={(e) => handleSettingChange('dataRetention', parseInt(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>6 months</option>
          <option value={365}>1 year</option>
          <option value={-1}>Forever</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Data Encryption"
        description="Encrypt your meeting data at rest"
      >
        <button
          onClick={() => handleSettingChange('enableEncryption', !settings.enableEncryption)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enableEncryption ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enableEncryption ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Allow Sharing"
        description="Enable sharing meetings with others"
      >
        <button
          onClick={() => handleSettingChange('allowSharing', !settings.allowSharing)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.allowSharing ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.allowSharing ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Password Protection"
        description="Require password for shared meetings"
      >
        <button
          onClick={() => handleSettingChange('requirePasswordForSharing', !settings.requirePasswordForSharing)}
          disabled={!settings.allowSharing}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.requirePasswordForSharing && settings.allowSharing ? 'bg-blue-600' : 'bg-gray-200'
          } ${!settings.allowSharing ? 'opacity-50' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.requirePasswordForSharing && settings.allowSharing ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>
    </div>
  );

  const renderExportSettings = () => (
    <div className="space-y-0">
      <SettingItem
        label="Default Export Format"
        description="Default format for exporting meeting data"
      >
        <select
          value={settings.defaultExportFormat}
          onChange={(e) => handleSettingChange('defaultExportFormat', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="pdf">PDF</option>
          <option value="docx">Word Document</option>
          <option value="txt">Plain Text</option>
          <option value="json">JSON</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Auto Export"
        description="Automatically export completed meetings"
      >
        <button
          onClick={() => handleSettingChange('autoExportEnabled', !settings.autoExportEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.autoExportEnabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.autoExportEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Slack Integration"
        description="Send meeting summaries to Slack"
      >
        <button
          onClick={() => handleSettingChange('integrationSettings.slack', !settings.integrationSettings.slack)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.integrationSettings.slack ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.integrationSettings.slack ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Microsoft Teams"
        description="Send meeting summaries to Teams"
      >
        <button
          onClick={() => handleSettingChange('integrationSettings.teams', !settings.integrationSettings.teams)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.integrationSettings.teams ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.integrationSettings.teams ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>

      <SettingItem
        label="Email Integration"
        description="Send meeting summaries via email"
      >
        <button
          onClick={() => handleSettingChange('integrationSettings.email', !settings.integrationSettings.email)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.integrationSettings.email ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.integrationSettings.email ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </SettingItem>
    </div>
  );

  const renderSettingsContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'audio':
        return renderAudioSettings();
      case 'notifications':
        return renderNotificationSettings();
      case 'privacy':
        return renderPrivacySettings();
      case 'export':
        return renderExportSettings();
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <AppLayout
      title="Settings"
      subtitle="Manage your preferences and configuration"
    >
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-4">
            {/* Sidebar */}
            <div className="lg:col-span-1 border-r border-gray-200">
              <nav className="p-4 space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{section.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {sections.find(s => s.id === activeSection)?.name}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {activeSection === 'general' && 'Configure your basic preferences and interface settings'}
                    {activeSection === 'audio' && 'Set default options for audio processing and transcription'}
                    {activeSection === 'notifications' && 'Manage how and when you receive notifications'}
                    {activeSection === 'privacy' && 'Control your data privacy and security settings'}
                    {activeSection === 'export' && 'Configure export formats and third-party integrations'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  {renderSettingsContent()}
                </div>

                {/* Save/Reset buttons */}
                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={isLoading}
                  >
                    Reset to Defaults
                  </Button>

                  <div className="flex items-center space-x-3">
                    {hasChanges && (
                      <span className="text-sm text-amber-600">
                        You have unsaved changes
                      </span>
                    )}
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || isLoading}
                      className="flex items-center space-x-2"
                    >
                      {isLoading && <LoadingSpinner size="sm" color="white" />}
                      <span>Save Settings</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}