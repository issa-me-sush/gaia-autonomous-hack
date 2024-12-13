import { AgentPaymentService } from '../../../utils/neverminedIntegration';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const paymentService = new AgentPaymentService();

  try {
    const { serviceId, userAddress, callCount } = req.body;

    // Process payment for agent service
    const paymentResult = await paymentService.processAgentPayment(
      serviceId,
      userAddress,
      callCount
    );

    // Return payment confirmation
    res.status(200).json({
      success: true,
      ...paymentResult
    });

  } catch (error) {
    console.error('Agent payment error:', error);
    res.status(500).json({ error: 'Failed to process agent payment' });
  }
} 