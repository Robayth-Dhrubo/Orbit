
import type {
  Request,
  Response,
  NextFunction
} from 'express';

// Authenticated user information will come
// from Robayth's authentication module.
export interface AuthenticatedUser {
  userId: string;
  role: 'student' | 'tutor';
}

// The service implementation will connect
// to Azmain's repository functions.
export interface TutorService {
  getAllTutors(): Promise<unknown>;

  getAvailableSlots(
    tutorId: string
  ): Promise<unknown>;

  createAvailability(
    user: AuthenticatedUser,
    tutorId: string,
    data: unknown
  ): Promise<unknown>;
}

// Authentication is supplied externally.
// This controller does not verify JWTs itself.
type GetAuthenticatedUser = (
  req: Request
) => AuthenticatedUser;

// Create the controller using dependencies
// supplied by the team's application.
export function createTutorController(
  service: TutorService,
  getAuthenticatedUser: GetAuthenticatedUser
) {

  // GET /tutors
  async function getTutors(
    _req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const tutors = await service.getAllTutors();

      return res.status(200).json(tutors);
    } catch (error) {
      next(error);
    }
  }

  // GET /tutors/:tutorId/slots
  async function getTutorSlots(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const tutorId = String(req.params.tutorId);
      const slots = await service.getAvailableSlots(
        tutorId
      );

      return res.status(200).json(slots);
    } catch (error) {
      next(error);
    }
  }

  // POST /tutors/:tutorId/slots
  async function createTutorSlot(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const tutorId = String(req.params.tutorId);

      const user = getAuthenticatedUser(req);

      const slot = await service.createAvailability(
        user,
        tutorId,
        req.body
      );

      return res.status(201).json(slot);
    } catch (error) {
      next(error);
    }
  }

  return {
    getTutors,
    getTutorSlots,
    createTutorSlot
  };
}
