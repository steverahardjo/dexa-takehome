import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type {
  Employee,
  Role,
} from '../../employee/entities/employee.entity.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CHOICE_TTL_SECONDS,
} from '../security/jwt.config.js';

export interface AccessToken {
  accessToken: string;
  /** Seconds until the token expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

/** A token that only buys the choose-your-view step, nothing else. */
export interface ChoiceToken {
  choiceToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Signs the access token the client sends back as `Authorization: Bearer`.
   * `role` is the view the person chose, which can be narrower than their record.
   */
  async issue(
    employee: Employee,
    role: Role = employee.role,
  ): Promise<AccessToken> {
    const accessToken = await this.jwtService.signAsync({
      sub: employee.id,
      email: employee.email,
      role,
      scope: 'access',
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      tokenType: 'Bearer',
    };
  }

  /** Signed between the OTP check and the admin/employee choice. */
  async issueChoice(employee: Employee): Promise<ChoiceToken> {
    const choiceToken = await this.jwtService.signAsync(
      { sub: employee.id, scope: 'choose' },
      { expiresIn: CHOICE_TTL_SECONDS },
    );

    return { choiceToken, expiresIn: CHOICE_TTL_SECONDS };
  }
}
