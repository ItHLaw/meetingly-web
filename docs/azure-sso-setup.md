# Microsoft Azure AD SSO Setup Guide

This guide walks you through setting up Microsoft Single Sign-On (SSO) for the Meetily web application.

## Prerequisites

- Microsoft Azure account with admin privileges
- Access to Azure Active Directory
- Domain name for your application (for production)

## Step 1: Azure AD Application Registration

### 1.1 Create New Application Registration

1. **Navigate to Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Sign in with your Microsoft account

2. **Access Azure Active Directory**
   - Search for "Azure Active Directory" in the search bar
   - Select "Azure Active Directory" from the results

3. **Create App Registration**
   - Click on "App registrations" in the left sidebar
   - Click "New registration" button
   - Fill in the application details:

   ```
   Name: Meetily Web Application
   Supported account types: Accounts in this organizational directory only (Single tenant)
   Redirect URI: 
     - Type: Web
     - URL: http://localhost:3000/auth/callback (development)
     - URL: https://your-domain.com/auth/callback (production)
   ```

4. **Complete Registration**
   - Click "Register" to create the application
   - Note down the **Application (client) ID** and **Directory (tenant) ID**

### 1.2 Configure Authentication

1. **Add Additional Redirect URIs**
   ```
   Development:
   - http://localhost:3000/auth/callback
   - http://localhost:3000/auth/silent-callback
   
   Production:
   - https://your-domain.com/auth/callback
   - https://your-domain.com/auth/silent-callback
   ```

2. **Configure Logout URLs**
   ```
   Front-channel logout URL: https://your-domain.com/auth/logout
   ```

3. **Enable ID Tokens**
   - Check "ID tokens (used for implicit and hybrid flows)"
   - Check "Access tokens (used for implicit flows)"

4. **Configure Advanced Settings**
   - Allow public client flows: No
   - Treat application as public client: No

### 1.3 Create Client Secret

1. **Navigate to Certificates & Secrets**
   - Click "Certificates & secrets" in the left sidebar
   - Click "New client secret" under "Client secrets"

2. **Create Secret**
   ```
   Description: Meetily Web App Secret
   Expires: 24 months (recommended)
   ```

3. **Save Secret Value**
   - **Important**: Copy the secret value immediately
   - Store it securely (you won't be able to see it again)

### 1.4 Configure API Permissions

1. **Set Required Permissions**
   - Click "API permissions" in the left sidebar
   - Verify these permissions are granted:
     - `openid` (Sign users in)
     - `profile` (View users' basic profile)
     - `email` (View users' email address)
     - `User.Read` (Sign in and read user profile)

2. **Grant Admin Consent**
   - Click "Grant admin consent for [Your Organization]"
   - Confirm the consent grant

### 1.5 Configure Token Configuration

1. **Add Optional Claims**
   - Click "Token configuration" in the left sidebar
   - Click "Add optional claim"
   - Select "ID" token type
   - Add these claims:
     - `email`
     - `family_name`
     - `given_name`
     - `preferred_username`

2. **Configure Group Claims** (Optional)
   - If you need group information, add group claims
   - Select appropriate group types based on your needs

## Step 2: Application Configuration

### 2.1 Environment Variables

Create the following environment variables:

#### Backend (.env)
```bash
# Microsoft SSO Configuration
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=your_tenant_id
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/your_tenant_id
MICROSOFT_SCOPE=openid profile email User.Read

# JWT Configuration
JWT_SECRET_KEY=your_secure_jwt_secret_key
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# CORS Origins
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

#### Frontend (.env.local)
```bash
# Microsoft SSO Configuration
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_application_client_id
NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_tenant_id
NEXT_PUBLIC_MICROSOFT_AUTHORITY=https://login.microsoftonline.com/your_tenant_id

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2.2 Production Configuration

For production deployment on Railway.app:

#### Railway Environment Variables
```bash
# Backend Service
MICROSOFT_CLIENT_ID=production_client_id
MICROSOFT_CLIENT_SECRET=production_client_secret
MICROSOFT_TENANT_ID=production_tenant_id
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/production_tenant_id
JWT_SECRET_KEY=production_jwt_secret
ALLOWED_ORIGINS=https://your-web-app.railway.app

# Frontend Service  
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=production_client_id
NEXT_PUBLIC_MICROSOFT_TENANT_ID=production_tenant_id
NEXT_PUBLIC_API_URL=https://your-api-service.railway.app
```

## Step 3: Verification Steps

### 3.1 Test Authentication Flow

1. **Verify App Registration**
   - Ensure all redirect URIs are correctly configured
   - Confirm client secret is valid and not expired
   - Check that permissions are granted

2. **Test Login Flow**
   - Navigate to your application
   - Click login button
   - Verify redirect to Microsoft login page
   - Confirm successful authentication and redirect

3. **Verify Token Claims**
   - Check that ID token contains expected claims
   - Ensure user information is correctly retrieved
   - Confirm token expiration and refresh works

### 3.2 Common Issues and Solutions

#### Issue: "AADSTS50011: The reply URL specified in the request does not match the reply URLs configured"
**Solution**: Ensure redirect URIs in Azure exactly match your application URLs

#### Issue: "AADSTS700051: The response_type 'token' is not enabled for the application"
**Solution**: Enable "Access tokens" in Authentication settings

#### Issue: "Invalid client secret"
**Solution**: Generate a new client secret and update environment variables

#### Issue: "AADSTS65001: The user or administrator has not consented to use the application"
**Solution**: Grant admin consent for the required permissions

## Step 4: Security Considerations

### 4.1 Production Security

1. **Client Secret Management**
   - Store secrets securely in Railway environment variables
   - Rotate secrets regularly (every 6-12 months)
   - Never commit secrets to version control

2. **Redirect URI Security**
   - Only add necessary redirect URIs
   - Use HTTPS in production
   - Avoid wildcards in redirect URIs

3. **Token Security**
   - Use short-lived access tokens
   - Implement proper token refresh logic
   - Store tokens securely (HttpOnly cookies recommended)

### 4.2 Monitoring and Logging

1. **Azure AD Logs**
   - Monitor sign-in logs in Azure AD
   - Set up alerts for failed authentication attempts
   - Review audit logs regularly

2. **Application Logs**
   - Log authentication events
   - Monitor token refresh failures
   - Track user login patterns

## Step 5: Testing Checklist

- [ ] Application registration created successfully
- [ ] Client ID and tenant ID noted
- [ ] Client secret generated and stored securely
- [ ] Redirect URIs configured for all environments
- [ ] API permissions granted and admin consent provided
- [ ] Environment variables configured correctly
- [ ] Login flow works in development
- [ ] Token refresh works correctly
- [ ] Logout flow completes successfully
- [ ] Production configuration tested

## Additional Resources

- [Microsoft Identity Platform Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Azure AD B2C Documentation](https://docs.microsoft.com/en-us/azure/active-directory-b2c/)
- [OAuth 2.0 and OpenID Connect](https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-v2-protocols)

## Support

For issues with Azure AD configuration:
1. Check Azure AD sign-in logs
2. Review application event logs
3. Consult Microsoft documentation
4. Contact Azure support if needed