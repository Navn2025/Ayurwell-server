/*
  Warnings:

  - You are about to drop the column `shippingCost` on the `Shipment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "shippingCost",
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0;
