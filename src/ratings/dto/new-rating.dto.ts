import { IsMongoId, IsNumber, Min } from 'class-validator';

export class NewRatingDto {
  @IsMongoId()
  userId: string;

  @IsNumber()
  @Min(0)
  score: number;
}
