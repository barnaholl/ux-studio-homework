import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from './decorators';
import type { JwtPayload } from './decorators';
import { RegisterDto, LoginDto } from './dto';
import {
  AccessTokenResponseDto,
  MessageResponseDto,
  ErrorResponseDto,
} from '../common/dto/response.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account and issues JWT access + refresh tokens. The refresh token is set as an httpOnly cookie.',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered, tokens issued',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
    type: ErrorResponseDto,
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates user credentials and issues JWT access + refresh tokens. The refresh token is set as an httpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens issued',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
    type: ErrorResponseDto,
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using refresh token cookie',
    description:
      'Atomically rotates the refresh token and issues a new access token. Requires the `refresh_token` httpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'New tokens issued',
    type: AccessTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token missing, invalid, or expired',
    type: ErrorResponseDto,
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }
    const tokens = await this.authService.refresh(rawToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @ApiBearerAuth()
  @Post('logout')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout — blacklist access token, clear refresh cookie',
    description:
      'Blacklists the current access token in Redis for its remaining TTL and deletes the refresh token from the database. Clears the refresh cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated',
    type: ErrorResponseDto,
  })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshTokenRaw = req.cookies?.[REFRESH_COOKIE_NAME] as
      | string
      | undefined;

    await this.authService.logout(user.jti, user.exp, refreshTokenRaw);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Logged out' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }
}
