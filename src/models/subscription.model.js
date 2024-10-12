import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    subscriber: {
      type: Schema.Types.ObjectId, // one who subscribing
      ref: "User",
    },
    channel: {
      type: Schema.Types.ObjectId, // one who subscribing
      ref: "User",
    },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model("Subsription", subscriptionSchema);
