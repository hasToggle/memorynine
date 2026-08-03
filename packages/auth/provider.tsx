"use client";

import type { ReactNode } from "react";

// better-auth's React client is hook-based and needs no context provider.
// AuthProvider stays as a pass-through so the design-system's provider
// stack (and its legal-URL props) keeps its shape.

interface AuthProviderProperties {
  children: ReactNode;
  helpUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

export const AuthProvider = ({ children }: AuthProviderProperties) => children;
