import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayloadRaw {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

/** Single point of truth for the JWT secret — read once here, used by both
 *  JwtModule (signing) and JwtStrategy (verification) via the same env var.
 *  Falls back to a known insecure string in non-production environments.
 *  main.ts throws at startup when NODE_ENV=production and JWT_SECRET is unset.
 */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  validate(payload: JwtPayloadRaw) {
    return {
      sub: payload.sub,
      email: payload.email,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
