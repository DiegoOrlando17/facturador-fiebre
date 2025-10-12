-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payment_method_id" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "customer" TEXT,
    "customer_doc_type" TEXT,
    "customer_doc_number" TEXT,
    "date_approved" TIMESTAMP(3),
    "cae" TEXT,
    "cae_vto" TEXT,
    "cbte_nro" TEXT,
    "cbte_tipo" INTEGER,
    "pto_vta" INTEGER,
    "pdf_path" TEXT,
    "drive_file_link" TEXT,
    "sheets_row" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" SERIAL NOT NULL,
    "pto_vta" INTEGER NOT NULL,
    "cbte_tipo" INTEGER NOT NULL,
    "last_nro" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_provider_payment_id_key" ON "Payment"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_pto_vta_key" ON "InvoiceSequence"("pto_vta");
