import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

@InputType()
export class AttachProductMediaInput {
  @Field(() => Int)
  @IsInt()
  product_id: number;

  @Field()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  url: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  variant_id?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  alt_text?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  type?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  position?: number;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  is_cover?: boolean;
}
