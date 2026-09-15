// Expose `id` instead of Mongo's `_id`/`__v` so the React client gets clean objects.
export const toJSONOptions = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
};
