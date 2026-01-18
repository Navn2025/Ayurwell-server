/*
  Warnings:

  - You are about to drop the column `fullName` on the `Address` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `Address` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Address" DROP COLUMN "fullName",
DROP COLUMN "phoneNumber";
