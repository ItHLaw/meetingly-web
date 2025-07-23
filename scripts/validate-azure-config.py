#!/usr/bin/env python3
"""
Azure AD Configuration Validation Script

This script validates that Microsoft Azure AD configuration is properly set up
for the Meetily web application.
"""

import os
import sys
import requests
import json
from typing import Dict, List, Optional
from urllib.parse import urljoin


class AzureConfigValidator:
    """Validates Azure AD configuration and connectivity."""
    
    def __init__(self):
        self.client_id = os.getenv('MICROSOFT_CLIENT_ID')
        self.client_secret = os.getenv('MICROSOFT_CLIENT_SECRET')
        self.tenant_id = os.getenv('MICROSOFT_TENANT_ID', 'common')
        self.errors: List[str] = []
        self.warnings: List[str] = []
        
    def validate_environment_variables(self) -> bool:
        """Validate required environment variables are set."""
        print("🔍 Validating environment variables...")
        
        required_vars = {
            'MICROSOFT_CLIENT_ID': self.client_id,
            'MICROSOFT_CLIENT_SECRET': self.client_secret,
            'MICROSOFT_TENANT_ID': self.tenant_id
        }
        
        missing_vars = []
        for var_name, var_value in required_vars.items():
            if not var_value:
                missing_vars.append(var_name)
        
        if missing_vars:
            self.errors.append(f"Missing required environment variables: {', '.join(missing_vars)}")
            return False
            
        print("✅ All required environment variables are set")
        return True
    
    def validate_client_id_format(self) -> bool:
        """Validate client ID format (should be a GUID)."""
        print("🔍 Validating client ID format...")
        
        if not self.client_id:
            return False
            
        # Basic GUID format validation
        if len(self.client_id) != 36 or self.client_id.count('-') != 4:
            self.errors.append("Client ID does not appear to be a valid GUID format")
            return False
            
        print("✅ Client ID format is valid")
        return True
    
    def validate_tenant_configuration(self) -> bool:
        """Validate tenant ID configuration."""
        print("🔍 Validating tenant configuration...")
        
        if self.tenant_id == 'common':
            self.warnings.append("Using 'common' tenant - ensure multi-tenant access is intended")
            print("⚠️  Using 'common' tenant (multi-tenant)")
        elif len(self.tenant_id) == 36 and self.tenant_id.count('-') == 4:
            print("✅ Using specific tenant ID")
        else:
            self.errors.append("Tenant ID should be 'common' or a valid GUID")
            return False
            
        return True
    
    def test_discovery_endpoint(self) -> bool:
        """Test Microsoft's OpenID Connect discovery endpoint."""
        print("🔍 Testing Microsoft discovery endpoint...")
        
        discovery_url = f"https://login.microsoftonline.com/{self.tenant_id}/v2.0/.well-known/openid_configuration"
        
        try:
            response = requests.get(discovery_url, timeout=10)
            response.raise_for_status()
            
            config = response.json()
            required_endpoints = ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint']
            
            for endpoint in required_endpoints:
                if endpoint not in config:
                    self.errors.append(f"Missing {endpoint} in discovery configuration")
                    return False
                    
            print("✅ Microsoft discovery endpoint is accessible")
            return True
            
        except requests.RequestException as e:
            self.errors.append(f"Failed to access discovery endpoint: {str(e)}")
            return False
    
    def validate_redirect_uris(self) -> bool:
        """Validate redirect URI configuration."""
        print("🔍 Validating redirect URI configuration...")
        
        # Check environment variables for redirect URIs
        frontend_url = os.getenv('NEXT_PUBLIC_REDIRECT_URI', 'http://localhost:3000/auth/callback')
        
        if not frontend_url.startswith(('http://', 'https://')):
            self.errors.append("Redirect URI must start with http:// or https://")
            return False
            
        if 'localhost' in frontend_url and not frontend_url.startswith('http://'):
            self.warnings.append("Using HTTP for localhost - ensure HTTPS is used in production")
        elif not frontend_url.startswith('https://') and 'localhost' not in frontend_url:
            self.errors.append("Production redirect URI must use HTTPS")
            return False
            
        print(f"✅ Redirect URI configuration: {frontend_url}")
        return True
    
    def generate_test_urls(self) -> Dict[str, str]:
        """Generate test URLs for manual verification."""
        base_auth_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/authorize"
        redirect_uri = os.getenv('NEXT_PUBLIC_REDIRECT_URI', 'http://localhost:3000/auth/callback')
        
        auth_url = (
            f"{base_auth_url}?"
            f"client_id={self.client_id}&"
            f"response_type=code&"
            f"redirect_uri={redirect_uri}&"
            f"scope=openid profile email User.Read&"
            f"response_mode=query"
        )
        
        return {
            'authorization_url': auth_url,
            'token_endpoint': f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token",
            'userinfo_endpoint': "https://graph.microsoft.com/v1.0/me"
        }
    
    def run_validation(self) -> bool:
        """Run all validation checks."""
        print("🚀 Starting Azure AD configuration validation...\n")
        
        checks = [
            self.validate_environment_variables,
            self.validate_client_id_format,
            self.validate_tenant_configuration,
            self.test_discovery_endpoint,
            self.validate_redirect_uris
        ]
        
        all_passed = True
        for check in checks:
            try:
                if not check():
                    all_passed = False
            except Exception as e:
                self.errors.append(f"Validation check failed: {str(e)}")
                all_passed = False
            print()
        
        return all_passed
    
    def print_results(self):
        """Print validation results."""
        print("=" * 60)
        print("VALIDATION RESULTS")
        print("=" * 60)
        
        if self.errors:
            print("\n❌ ERRORS:")
            for error in self.errors:
                print(f"   • {error}")
        
        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"   • {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All validations passed!")
        elif not self.errors:
            print("\n✅ Configuration is valid (with warnings)")
        else:
            print("\n❌ Configuration has errors that need to be fixed")
        
        # Print test URLs
        print("\n" + "=" * 60)
        print("TEST URLS")
        print("=" * 60)
        
        if self.client_id:
            test_urls = self.generate_test_urls()
            print(f"\n🔗 Authorization URL:")
            print(f"   {test_urls['authorization_url']}")
            print(f"\n🔗 Token Endpoint:")
            print(f"   {test_urls['token_endpoint']}")
            print(f"\n🔗 User Info Endpoint:")
            print(f"   {test_urls['userinfo_endpoint']}")
        
        print("\n" + "=" * 60)
        print("NEXT STEPS")
        print("=" * 60)
        
        if self.errors:
            print("\n1. Fix the errors listed above")
            print("2. Re-run this validation script")
            print("3. Test authentication flow in your application")
        else:
            print("\n1. Test the authorization URL in your browser")
            print("2. Verify you can complete the OAuth flow")
            print("3. Check that user information is retrieved correctly")
            print("4. Test logout functionality")


def main():
    """Main function to run validation."""
    validator = AzureConfigValidator()
    
    # Check if running with --help
    if '--help' in sys.argv or '-h' in sys.argv:
        print(__doc__)
        print("\nUsage: python validate-azure-config.py")
        print("\nEnvironment variables required:")
        print("  MICROSOFT_CLIENT_ID     - Azure AD application client ID")
        print("  MICROSOFT_CLIENT_SECRET - Azure AD application client secret")
        print("  MICROSOFT_TENANT_ID     - Azure AD tenant ID (or 'common')")
        print("  NEXT_PUBLIC_REDIRECT_URI - OAuth redirect URI (optional)")
        return
    
    success = validator.run_validation()
    validator.print_results()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()