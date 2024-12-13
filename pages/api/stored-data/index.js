import dbConnect from "@/lib/dbConnect";
import StoredData from "@/models/StoredData";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const storedData = await StoredData.find({}).sort({ createdAt: -1 });

    // Group by category
    const groupedData = storedData.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {});

    res.status(200).json(groupedData);
  } catch (error) {
    console.error('Error fetching stored data:', error);
    res.status(500).json({ error: 'Failed to fetch stored data' });
  }
} 