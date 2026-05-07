const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['superadmin', 'admin', 'tailor'], default: 'admin' },
    shopName: { type: String, trim: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // WhatsApp messaging quota — managed per tenant by SuperAdmin (Phase 1: shared platform number)
    whatsappQuota: { type: Number, default: 100 },
    whatsappUsed: { type: Number, default: 0 },
    whatsappQuotaResetAt: { type: Date, default: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    } },
  },
  { timestamps: true }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('User', userSchema);
