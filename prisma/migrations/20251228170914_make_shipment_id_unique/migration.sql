/*
  Warnings:

  - A unique constraint covering the columns `[shipmentId]` on the table `Shipment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentId_key" ON "Shipment"("shipmentId");
