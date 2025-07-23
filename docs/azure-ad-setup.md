# Microsoft Azure AD Application Registration Guide

This guide walks through setting up Microsoft Azure AD application registration for the Meetily web application.

## Prerequisites

- Access to Microsoft Azure portal with appropriate permissions
- Admin consent capability for your organization (if required)

## Step 1: Create Azure AD Application

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Go to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the application details:
   - **Name**: `Meetily Web Application`
   - **Supported account types**: 
     - For single tenant: "Accounts in this organizational directory only"
     - For multi-tenant: "Accounts in any organizational directory"
   - **Redirect URI**: 
     - Platform: Web
     - URI: `http://localhost:3000/auth/callback` (development)
     - URI: `https://your-domain.railway.app/auth/callback` (production)

## Step 2: Configure Authentication

1. In your registered app, go to **Authentication**
2. Add additional redirect URIs if needed:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://your-domain.railway.app/auth/callback`
3. Under **Implicit grant and hybrid flows**, enable:
   - ✅ Access tokens (used for implicit flows)
   - ✅ ID tokens (used for implicit and hybrid flows)
4. Set **Logout URL**: 
   - Development: `http://localhost:3000/auth/logout`
   - Production: `https://your-domain.railway.app/auth/logout`

## Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add the following permissions:
   - `openid` - Sign users in
   - `profile` - View users' basic profile
   - `email` - View users' email address
   - `User.Read` - Read user profile
6. Click **Grant admin consent** (if you have admin privileges)

## Step 4: Generate Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description: `Meetily Web App Secret`
4. Set expiration (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - it won't be shown again

## Step 5: Collect Configuration Values

From your Azure AD application, collect these values:

- **Application (client) ID**: Found on the Overview page
- **Directory (tenant) ID**: Found on the Overview page  
- **Client Secret**: The value you just created
- **Tenant ID**: Use "common" for multi-tenant, or your specific tenant ID

## Step 6: Update Environment Variables

Update your `.env.local` file with the collected values:

```env
# Microsoft SSO Configuration
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_application_client_id
NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_tenant_id_or_common
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# Backend API Configuration  
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=your_tenant_id_or_common
```

## Step 7: Configure Backend Environment

Update your API `.env` file:

```env
# Microsoft SSO Configuration
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=your_tenant_id_or_common
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/your_tenant_id_or_common

# JWT Configuration
JWT_SECRET_KEY=your_jwt_secret_key_change_in_production
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Session Configuration
SESSION_SECRET_KEY=your_session_secret_key_change_in_production
SESSION_EXPIRATION_HOURS=24
```

## Security Best Practices

1. **Client Secret Management**:
   - Never commit client secrets to version control
   - Use environment variables or secure key management
   - Rotate secrets regularly

2. **Redirect URI Security**:
   - Use HTTPS in production
   - Validate redirect URIs strictly
   - Avoid wildcard redirect URIs

3. **Permissions**:
   - Request minimal required permissions
   - Review permissions regularly
   - Document why each permission is needed

4. **Tenant Configuration**:
   - Use specific tenant ID for single-tenant apps
   - Use "common" only if multi-tenant support is required
   - Consider security implications of multi-tenant access

## Troubleshooting

### Common Issues

1. **AADSTS50011: Redirect URI mismatch**
   - Ensure redirect URI in Azure matches exactly what your app sends
   - Check for trailing slashes, HTTP vs HTTPS

2. **AADSTS65001: User or administrator has not consented**
   - Grant admin consent in Azure portal
   - Or implement user consent flow in application

3. **AADSTS70011: Invalid scope**
   - Verify requested scopes are configured in Azure
   - Check scope format (space-separated)

### Testing the Configuration

1. Test authentication flow in development environment
2. Verify token validation works correctly
3. Test logout functionality
4. Validate user information retrieval

## Production Deployment

When deploying to Railway.app:

1. Update redirect URIs to production URLs
2. Set environment variables in Railway dashboard
3. Ensure HTTPS is enabled
4. Test authentication flow in production environment
5. Monitor authentication logs for issues

## References

- [Microsoft Identity Platform Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Azure AD App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Graph Permissions Reference](https://docs.microsoft.com/en-us/graph/permissions-reference)