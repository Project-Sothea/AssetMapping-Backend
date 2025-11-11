-- AssetMapping Database Initialization

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create pins table
CREATE TABLE IF NOT EXISTS pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- quotation is to maintain camelCase
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'normal',
    name VARCHAR(255),
    address TEXT,
    "cityVillage" VARCHAR(255),
    description TEXT,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "failureReason" TEXT,
    status VARCHAR(50),
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
    "lastFailedSyncAt" TIMESTAMP WITH TIME ZONE,
    localImages TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    version INTEGER DEFAULT 1
);

-- Create forms table
CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "pinId" UUID NOT NULL REFERENCES pins(id),
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    village VARCHAR(255),
    "villageId" VARCHAR(255),
    "failureReason" TEXT,
    status VARCHAR(50),
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
    "lastFailedSyncAt" TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1,
    name VARCHAR(255),

    -- Health survey fields (stored as strings, often JSON arrays)
    "canAttend" TEXT,
    "otherCondition" TEXT,
    "conditionDetails" TEXT,
    "otherManagement" TEXT,
    "otherSickAction" TEXT,
    "knowDoctor" TEXT,
    "ownTransport" TEXT,
    "whereBuyMedicine" TEXT,
    "otherBuyMedicine" TEXT,
    "povertyCard" TEXT,
    "brushTeeth" TEXT,
    "otherBrushTeeth" TEXT,
    "haveToothbrush" TEXT,
    diarrhoea TEXT,
    "diarrhoeaAction" TEXT,
    "coldLookLike" TEXT,
    "mskInjury" TEXT,
    hypertension TEXT,
    cholesterol TEXT,
    diabetes TEXT,
    "handBeforeMeal" TEXT,
    "handAfterToilet" TEXT,
    "eatCleanFood" TEXT,
    "otherLearning" TEXT,
    "otherWaterSource" TEXT,
    "knowWaterFilters" TEXT,
    "otherWaterFilterReason" TEXT,
    "cholesterolAction" TEXT,
    "coldAction" TEXT,
    "diabetesAction" TEXT,
    "hypertensionAction" TEXT,
    "longTermConditions" TEXT,
    "managementMethods" TEXT,
    "mskAction" TEXT,
    "notUsingWaterFilter" TEXT,
    "unsafeWater" TEXT,
    "waterSources" TEXT,
    "whatDoWhenSick" TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pins_deleted_at ON pins("deletedAt");
CREATE INDEX IF NOT EXISTS idx_pins_updated_at ON pins("updatedAt");
CREATE INDEX IF NOT EXISTS idx_pins_id_version ON pins(id, version);

CREATE INDEX IF NOT EXISTS idx_forms_pin_id ON forms("pinId");
CREATE INDEX IF NOT EXISTS idx_forms_deleted_at ON forms("deletedAt");
CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms("updatedAt");
CREATE INDEX IF NOT EXISTS idx_forms_id_version ON forms(id, version);

-- Create trigger function function to create the updatedAt timestamp
CREATE OR REPLACE FUNCTION create_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to autoset updatedAt
DROP TRIGGER IF EXISTS tr_pins_updated_at ON pins;
CREATE TRIGGER tr_pins_updated_at
    BEFORE UPDATE ON pins
    FOR EACH ROW
    EXECUTE FUNCTION create_updated_at();

DROP TRIGGER IF EXISTS tr_forms_updated_at ON forms;
CREATE TRIGGER tr_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW
    EXECUTE FUNCTION create_updated_at();