import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './users/users.entity';
import { UserSubscription } from './users/user-subscription.entity';
import { Program } from './programs/programs.entity';
import { Channel } from './channels/channels.entity';
import { Device } from './users/device.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { PushSubscriptionEntity } from './push/push-subscription.entity';

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  entities: [User, UserSubscription, Program, Channel, Device, Schedule, Panelist, PushSubscriptionEntity],
  synchronize: false,
  logging: false,
}); 