import {BadRequestException, Injectable} from '@nestjs/common';
import {PrismaService} from 'src/prisma.service';
import {RatingPeriod} from './types/rating-period';
import {NewRatingDto} from './dto/new-rating.dto';

@Injectable()
export class RatingsService {
    constructor(private readonly prisma: PrismaService) {
    }

    async getAll(period: RatingPeriod) {
        const currentDate = new Date();
        let startDate: Date;
        let endDate: Date;

        switch (period) {
            case RatingPeriod.DAILY:
                startDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate()
                );
                endDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() + 1
                );
                break;
            case RatingPeriod.WEEKLY:
                startDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() - currentDate.getDay()
                );
                endDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() - currentDate.getDay() + 7
                );
                break;
            case RatingPeriod.MONTHLY:
                startDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    1
                );
                endDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth() + 1,
                    1
                );
                break;
            case RatingPeriod.ALL_TIME:
                startDate = new Date(0); // Earliest possible date
                endDate = new Date(); // Current date
                break;
            default:
                throw new BadRequestException('Invalid rating period');
        }

        // Aggregate ratings by user within the specified period
        const aggregatedRatings = await this.prisma.rating.groupBy({
            by: ['userId'],
            where: {
                createdAt: {
                    gte: startDate,
                    lt: endDate,
                },
            },
            _sum: {
                score: true,
            },
            orderBy: {
                _sum: {
                    score: 'desc',
                },
            },
        });

        const userIds = aggregatedRatings.map((r) => r.userId);
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
        });
        const userMap = new Map(users.map((u) => [u.id, u]));

        return aggregatedRatings.map((rating, index) => ({
            userId: rating.userId,
            score: rating._sum.score,
            user: {
                ...userMap.get(rating.userId),
                ranking: index + 1,
            },
        }));
    }

    async saveNewRating(newRatingDto: NewRatingDto) {
        // Use a transaction to ensure atomic update of rating and user
        const result = await this.prisma.$transaction(async (prisma) => {
            // Create new rating
            const rating = await prisma.rating.create({
                data: {
                    score: newRatingDto.score,
                    userId: newRatingDto.userId,
                },
            });

            // Calculate total user rating and update user in one operation
            const userRatings = await prisma.rating.findMany({
                where: {userId: newRatingDto.userId},
                select: {score: true}
            });

            const totalScore = userRatings.reduce((sum, r) => sum + r.score, 0);

            const updatedUser = await prisma.user.update({
                where: {id: newRatingDto.userId},
                data: {
                    rating: totalScore, // Store total rating
                    coins: {increment: newRatingDto.score}, // Increment coins
                },
            });

            return {rating, user: updatedUser};
        });

        return result.rating;
    }
}