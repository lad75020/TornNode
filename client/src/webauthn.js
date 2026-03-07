import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration
} from '@simplewebauthn/browser';

function readJson(response) {
  return response.json().catch(() => ({}));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await readJson(response);

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || 'Access key request failed');
  }

  return data;
}

export function getAccessKeySupport() {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Access keys are only available in a browser' };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Access keys require HTTPS or localhost' };
  }
  if (!browserSupportsWebAuthn()) {
    return { supported: false, reason: 'This browser does not support WebAuthn access keys' };
  }
  return { supported: true, reason: '' };
}

export function describeAccessKeyError(error) {
  if (!error) return 'Access key request failed';

  if (typeof error === 'string') {
    return error;
  }

  if (error.name === 'NotAllowedError') {
    return 'Access key request was cancelled or timed out';
  }
  if (error.name === 'InvalidStateError') {
    return 'This access key is already registered on this device';
  }
  if (error.name === 'SecurityError') {
    return 'Access keys require HTTPS or localhost';
  }
  if (error.code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT') {
    return 'This authenticator cannot create discoverable access keys';
  }
  if (error.code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT') {
    return 'This authenticator does not support biometric or PIN verification';
  }

  return error.message || 'Access key request failed';
}

export async function loginWithAccessKey() {
  const support = getAccessKeySupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  const { options } = await requestJson('/webauthn/authenticate/options', {
    method: 'POST',
    body: JSON.stringify({})
  });
  const authenticationResponse = await startAuthentication({ optionsJSON: options });

  return requestJson('/webauthn/authenticate/verify', {
    method: 'POST',
    body: JSON.stringify({ authenticationResponse })
  });
}

export async function fetchAccessKeys() {
  return requestJson('/webauthn/credentials');
}

export async function registerAccessKey(name) {
  const support = getAccessKeySupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  const { options } = await requestJson('/webauthn/register/options', {
    method: 'POST',
    body: JSON.stringify({})
  });
  const registrationResponse = await startRegistration({ optionsJSON: options });

  return requestJson('/webauthn/register/verify', {
    method: 'POST',
    body: JSON.stringify({ name, registrationResponse })
  });
}

export async function removeAccessKey(credentialID) {
  return requestJson('/webauthn/credentials/remove', {
    method: 'POST',
    body: JSON.stringify({ credentialID })
  });
}
