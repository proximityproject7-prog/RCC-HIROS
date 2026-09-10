import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// WebAuthn Configuration for RCC-HIROS
// Uses Windows Hello / fingerprint reader via WebAuthn API
// ═══════════════════════════════════════════════════════════════

const RP_NAME = "RCC-HIROS";
const RP_ID = "localhost"; // Change to actual domain in production
const ORIGIN = `http://${RP_ID}:3000`;

// In-memory challenge storage (use Redis/DB in production)
const challengeStore = new Map<string, string>();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, _] of challengeStore) {
    const timestamp = parseInt(key.split(":")[1], 10);
    if (now - timestamp > 300000) {
      challengeStore.delete(key);
    }
  }
}, 300000);

export function storeChallenge(key: string, challenge: string) {
  challengeStore.set(key, challenge);
}

export function getChallenge(key: string): string | undefined {
  const challenge = challengeStore.get(key);
  challengeStore.delete(key);
  return challenge;
}

// ═══════════════════════════════════════════════════════════════
// REGISTRATION (Enrollment)
// ═══════════════════════════════════════════════════════════════

export async function generateRegistrationOpts(
  employeeId: string,
  fingerIndex: number
) {
  // Get existing credentials for this employee
  const existingCredentials = await db.biometricTemplate.findMany({
    where: { employeeId },
    select: { credentialId: true },
  });

  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credentialId,
    type: "public-key" as const,
    transports: ["internal"] as AuthenticatorTransport[],
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(employeeId),
    userName: `employee-${employeeId}`,
    userDisplayName: `Finger ${fingerIndex + 1}`,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "preferred",
      authenticatorAttachment: "platform", // Use platform authenticator (Windows Hello)
    },
  });

  // Store challenge
  storeChallenge(`reg:${employeeId}:${fingerIndex}`, options.challenge);

  return options;
}

export async function verifyRegistration(
  employeeId: string,
  fingerIndex: number,
  response: RegistrationResponseJSON
) {
  const challenge = getChallenge(`reg:${employeeId}:${fingerIndex}`);

  if (!challenge) {
    return { verified: false, error: "Challenge expired or not found" };
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false, error: "Registration verification failed" };
  }

  const { credential } = verification.registrationInfo;

  // Check if this credential ID already exists
  const existingCred = await db.biometricTemplate.findFirst({
    where: {
      credentialId: credential.id,
    },
  });

  if (existingCred) {
    return { verified: false, error: "This fingerprint is already registered" };
  }

  // Check max templates per employee (2 fingers max)
  const templateCount = await db.biometricTemplate.count({
    where: { employeeId },
  });

  if (templateCount >= 2) {
    return { verified: false, error: "Maximum 2 fingers per employee" };
  }

  // Check if this finger slot is already taken
  const existingFinger = await db.biometricTemplate.findFirst({
    where: { employeeId, fingerIndex },
  });

  if (existingFinger) {
    // Delete existing enrollment for this finger
    await db.biometricTemplate.delete({
      where: { id: existingFinger.id },
    });
  }

  // Save credential
  const template = await db.biometricTemplate.create({
    data: {
      employeeId,
      fingerIndex,
      credentialId: credential.id,
      credentialPubKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      quality: 100, // WebAuthn doesn't provide quality metrics
    },
  });

  return {
    verified: true,
    template: {
      id: template.id,
      fingerIndex: template.fingerIndex,
      quality: template.quality,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION (Kiosk Clock-In)
// ═══════════════════════════════════════════════════════════════

export async function generateAuthenticationOpts() {
  // Get all registered credentials
  const allCredentials = await db.biometricTemplate.findMany({
    select: { credentialId: true },
  });

  const allowCredentials = allCredentials.map((cred) => ({
    id: cred.credentialId,
    type: "public-key" as const,
    transports: ["internal"] as AuthenticatorTransport[],
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: "discouraged",
  });

  // Store challenge for kiosk
  storeChallenge(`auth:kiosk`, options.challenge);

  return options;
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON
) {
  const challenge = getChallenge(`auth:kiosk`);

  if (!challenge) {
    return { verified: false, error: "Challenge expired" };
  }

  // Find the credential
  const credential = await db.biometricTemplate.findFirst({
    where: { credentialId: response.id },
    include: { employee: true },
  });

  if (!credential) {
    return { verified: false, error: "Credential not found" };
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.credentialPubKey, "base64url"),
      counter: credential.counter,
      transports: ["internal"],
    },
  });

  if (!verification.verified) {
    return { verified: false, error: "Authentication failed" };
  }

  // Update counter
  await db.biometricTemplate.update({
    where: { id: credential.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  return {
    verified: true,
    employee: {
      id: credential.employee.id,
      employeeId: credential.employee.employeeId,
      firstName: credential.employee.firstName,
      lastName: credential.employee.lastName,
      photoPath: credential.employee.photo,
    },
  };
}
