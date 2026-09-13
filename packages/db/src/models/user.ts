import { UserRole } from "@ffa/shared";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    rol: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
      default: UserRole.ANALISTA,
    },
    activo: { type: Boolean, default: true },
    ultimoAcceso: { type: Date },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };

export const UserModel: Model<UserDocument> = model<UserDocument>("User", userSchema);
