-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "actualWeight" DOUBLE PRECISION,
ADD COLUMN     "chargeableWeight" DOUBLE PRECISION,
ADD COLUMN     "volumetricWeight" DOUBLE PRECISION;
