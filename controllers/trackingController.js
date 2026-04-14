const Order = require('../models/Order');
const Invoice = require('../models/Invoice');

// @desc    Public tracking endpoint - no auth required
// @route   GET /api/track/:trackingId
// @access  Public
const getTrackingInfo = async (req, res) => {
  const { trackingId } = req.params;

  const order = await Order.findOne({ tracking_id: trackingId })
    .populate('customer_id', 'name phone email')
    .lean();

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found. Please check your tracking link.',
    });
  }

  const invoice = await Invoice.findOne({ order_id: order._id })
    .select('invoice_number total_amount advance_paid pending_amount discount payment_status')
    .lean();

  // Sanitize: hide internal fields
  const publicOrder = {
    _id: order._id,
    order_number: order.order_number,
    tracking_id: order.tracking_id,
    order_date: order.order_date,
    trial_date: order.trial_date,
    delivery_date: order.delivery_date,
    status: order.status,
    progress: order.progress,
    notes: order.notes,
    customer: {
      name: order.customer_id?.name,
      phone: order.customer_id?.phone,
    },
    items: order.items.map((item) => ({
      _id: item._id,
      type: item.type,
      quantity: item.quantity,
      status: item.status,
      cloth_image: item.cloth_image,
      description: item.description,
      measurements: item.measurements,
    })),
    invoice: invoice
      ? {
          invoice_number: invoice.invoice_number,
          total_amount: invoice.total_amount,
          advance_paid: invoice.advance_paid,
          pending_amount: invoice.pending_amount,
          discount: invoice.discount,
          payment_status: invoice.payment_status,
        }
      : null,
  };

  res.json({ success: true, data: publicOrder });
};

module.exports = { getTrackingInfo };
