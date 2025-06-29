import { User } from './users.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';
// Remove export { Device };
// Remove export default Device; 

export class Device {
  // ... class body ...
  user: User;
  pushSubscriptions: PushSubscriptionEntity[];
} 