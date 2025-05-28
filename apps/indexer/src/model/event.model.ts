import {
  BigIntColumn,
  DateTimeColumn,
  Entity,
  IntColumn,
  PrimaryColumn,
  StringColumn,
  Column,
} from "@subsquid/typeorm-store";

@Entity()
export class Event {
  constructor(props?: Partial<Event>) {
    Object.assign(this, props);
  }

  @PrimaryColumn()
  id!: string;

  @StringColumn({ nullable: false })
  eventType!: string; // "launch" or "swap"

  @StringColumn({ nullable: false })
  signature!: string;

  @IntColumn({ nullable: false })
  blockHeight!: number;

  @DateTimeColumn({ nullable: false })
  timestamp!: Date;

  @StringColumn({ nullable: false })
  from!: string;

  // Launch-specific fields
  @StringColumn({ nullable: true })
  name?: string;

  @StringColumn({ nullable: true })
  symbol?: string;

  @StringColumn({ nullable: true })
  uri?: string;

  @IntColumn({ nullable: true })
  decimals?: number;

  @StringColumn({ nullable: true })
  mintAddress?: string;

  // Swap-specific fields
  @BigIntColumn({ nullable: true })
  amount?: bigint;

  @StringColumn({ nullable: true })
  direction?: string; // "buy" or "sell"

  @BigIntColumn({ nullable: true })
  minimumReceiveAmount?: bigint;

  @BigIntColumn({ nullable: true })
  wantedAmount?: bigint;

  @BigIntColumn({ nullable: true })
  receivedAmount?: bigint;

  @StringColumn({ nullable: true })
  tokenMint?: string;

  @DateTimeColumn({ nullable: false })
  createdAt!: Date;
}
