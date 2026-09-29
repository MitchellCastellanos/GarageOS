-- Block 8: permisos finos por usuario (aditiva).
-- AlterTable
ALTER TABLE "garageos"."User" ADD COLUMN     "permissionDenies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permissionGrants" TEXT[] DEFAULT ARRAY[]::TEXT[];

