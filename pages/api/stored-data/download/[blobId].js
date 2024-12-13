export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { blobId } = req.query;

  try {
    const response = await fetch(`${process.env.AGGREGATOR_URL}/v1/${blobId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch blob data');
    }

    const data = await response.text();
    res.status(200).json({ content: data });
  } catch (error) {
    console.error('Error downloading blob:', error);
    res.status(500).json({ error: 'Failed to download blob' });
  }
} 