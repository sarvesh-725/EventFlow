import type { UserRole, OrganizerStatus } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sessionId: string;
        user: {
          id: string;
          email: string;
          name: string;
          role: UserRole;
          organizerStatus: OrganizerStatus | null;
        };
      };
    }
  }
}

export {};
