import type { PlacementStage, PlacementApplication } from './placement.js';

export type PlacementActorRole = 'institution' | 'intermediary' | 'employer' | 'job_seeker' | 'admin';

export class IllegalStateTransitionError extends Error {
  readonly code = 'ILLEGAL_TRANSITION';
  constructor(public readonly from: PlacementStage, public readonly to: PlacementStage, reason?: string) {
    super(reason || `Illegal transition from '${from}' to '${to}'`);
    this.name = 'IllegalStateTransitionError';
  }
}

export class MissingTransitionPayloadError extends Error {
  readonly code = 'MISSING_PAYLOAD';
  constructor(public readonly field: string, public readonly targetStage: PlacementStage, details?: string) {
    super(details || `Field '${field}' is required when transitioning to stage '${targetStage}'`);
    this.name = 'MissingTransitionPayloadError';
  }
}

export class UnauthorizedStateTransitionActorError extends Error {
  readonly code = 'UNAUTHORIZED_ACTOR';
  constructor(public readonly role: PlacementActorRole, public readonly targetStage: PlacementStage) {
    super(`Actor with role '${role}' is not authorized to transition application to '${targetStage}'`);
    this.name = 'UnauthorizedStateTransitionActorError';
  }
}

/**
 * Permitted State Transition Graph
 * Key = current stage, Value = array of allowed target stages
 */
export const LEGAL_STAGE_TRANSITIONS: Readonly<Record<PlacementStage, readonly PlacementStage[]>> = {
  applied: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'offered', 'rejected'],
  interview: ['offered', 'rejected', 'shortlisted'],
  offered: ['placed', 'rejected'],
  placed: [], // Terminal stage: cannot transition further
  rejected: ['applied'], // Reactivation requires re-nomination back to applied
};

/**
 * Actor permissions matrix per target stage
 */
export const STAGE_ACTOR_PERMISSIONS: Readonly<Record<PlacementStage, readonly PlacementActorRole[]>> = {
  applied: ['institution', 'intermediary', 'admin'],
  shortlisted: ['employer', 'admin'],
  interview: ['employer', 'admin'],
  offered: ['employer', 'admin'],
  placed: ['employer', 'institution', 'intermediary', 'job_seeker', 'admin'],
  rejected: ['employer', 'institution', 'intermediary', 'admin'],
};

export interface StateTransitionContext {
  readonly currentStage: PlacementStage;
  readonly targetStage: PlacementStage;
  readonly actorRole: PlacementActorRole;
  readonly offerPackage?: string | null;
  readonly existingOfferPackage?: string | null;
  readonly interviewDate?: string | null;
  readonly rejectionReason?: string | null;
}

export interface TransitionValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly code?: 'ILLEGAL_TRANSITION' | 'MISSING_PAYLOAD' | 'UNAUTHORIZED_ACTOR';
}

/**
 * Pure predicate: Check if a transition edge exists in the FSM graph
 */
export function isValidTransition(from: PlacementStage, to: PlacementStage): boolean {
  if (from === to) {
    return true; // No-op transition is permitted
  }
  const allowed = LEGAL_STAGE_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Returns allowed next stages given current stage and actor role
 */
export function getAllowedNextStages(
  from: PlacementStage,
  actorRole?: PlacementActorRole,
): readonly PlacementStage[] {
  const allowedTargets = LEGAL_STAGE_TRANSITIONS[from] || [];
  if (!actorRole) {
    return allowedTargets;
  }
  return allowedTargets.filter((stage) => {
    const roles = STAGE_ACTOR_PERMISSIONS[stage];
    return roles ? roles.includes(actorRole) || actorRole === 'admin' : false;
  });
}

/**
 * Validates state transition against FSM graph, actor role, and payload invariants
 */
export function validateTransition(ctx: StateTransitionContext): TransitionValidationResult {
  const { currentStage, targetStage, actorRole, offerPackage, existingOfferPackage, interviewDate } = ctx;

  // 1. Same stage is a no-op update
  if (currentStage === targetStage) {
    return { valid: true };
  }

  // 2. FSM Graph transition check
  if (!isValidTransition(currentStage, targetStage)) {
    return {
      valid: false,
      code: 'ILLEGAL_TRANSITION',
      error: `Illegal state transition: cannot transition from '${currentStage}' to '${targetStage}'`,
    };
  }

  // 3. Actor authorization check
  const allowedRoles = STAGE_ACTOR_PERMISSIONS[targetStage];
  const isAuthorized = allowedRoles && (allowedRoles.includes(actorRole) || actorRole === 'admin');
  if (!isAuthorized) {
    return {
      valid: false,
      code: 'UNAUTHORIZED_ACTOR',
      error: `Unauthorized: role '${actorRole}' is not permitted to move application to '${targetStage}'`,
    };
  }

  // 4. Payload invariant: 'interview' stage requires interviewDate
  if (targetStage === 'interview') {
    if (!interviewDate || !interviewDate.trim()) {
      return {
        valid: false,
        code: 'MISSING_PAYLOAD',
        error: `Stage 'interview' requires an 'interviewDate'`,
      };
    }
  }

  // 5. Payload invariant: 'offered' or 'placed' stage requires offerPackage
  if (targetStage === 'offered' || targetStage === 'placed') {
    const activePackage = (offerPackage && offerPackage.trim()) || (existingOfferPackage && existingOfferPackage.trim());
    if (!activePackage) {
      return {
        valid: false,
        code: 'MISSING_PAYLOAD',
        error: `Stage '${targetStage}' requires an 'offerPackage'`,
      };
    }
  }

  return { valid: true };
}

/**
 * Assertion version: throws typed domain error if validation fails
 */
export function assertValidTransition(ctx: StateTransitionContext): void {
  const result = validateTransition(ctx);
  if (!result.valid) {
    if (result.code === 'ILLEGAL_TRANSITION') {
      throw new IllegalStateTransitionError(ctx.currentStage, ctx.targetStage, result.error);
    }
    if (result.code === 'UNAUTHORIZED_ACTOR') {
      throw new UnauthorizedStateTransitionActorError(ctx.actorRole, ctx.targetStage);
    }
    if (result.code === 'MISSING_PAYLOAD') {
      const field = ctx.targetStage === 'interview' ? 'interviewDate' : 'offerPackage';
      throw new MissingTransitionPayloadError(field, ctx.targetStage, result.error);
    }
    throw new Error(result.error || 'Transition validation failed');
  }
}

/**
 * Double-Placement Lock:
 * When a candidate accepts an offer and is marked 'placed',
 * all other active applications for this candidate are automatically withdrawn/closed.
 */
export function applyDoublePlacementLock(
  studentId: string,
  placedApplicationId: string,
  applications: readonly PlacementApplication[],
): {
  readonly updatedApplications: readonly PlacementApplication[];
  readonly lockedCount: number;
} {
  let lockedCount = 0;
  const nowStr = new Date().toISOString().split('T')[0] ?? '2026-10-23';

  const updatedApplications = applications.map((app) => {
    // If it's the accepted placement, keep it placed
    if (app.id === placedApplicationId) {
      return app;
    }

    // If it's another application for the same student in an active stage, auto-withdraw
    if (app.studentId === studentId && app.stage !== 'placed' && app.stage !== 'rejected') {
      lockedCount += 1;
      return {
        ...app,
        stage: 'rejected' as const,
        updatedAt: nowStr,
        offerPackage: undefined, // Clear any pending offer
      };
    }

    return app;
  });

  return { updatedApplications, lockedCount };
}
