import { useState, useEffect } from 'react';

export default function StoredDataViewer() {
  const [groupedData, setGroupedData] = useState({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchStoredData();
  }, []);

  const fetchStoredData = async () => {
    try {
      const response = await fetch('/api/stored-data');
      const data = await response.json();
      setGroupedData(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadAllBlobs = async (category) => {
    setDownloading(true);
    try {
      const blobs = groupedData[category];
      const contents = await Promise.all(
        blobs.map(async (blob) => {
          const response = await fetch(`/api/stored-data/download/${blob.blobId}`);
          const data = await response.json();
          return data.content;
        })
      );

      const combinedContent = contents.join('\n\n--- New Entry ---\n\n');
      const blob = new Blob([combinedContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${category}-combined-data.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading blobs:', error);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] pt-20">
        <div className="text-center p-8 text-cyan-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] pt-20">
      <div className="container mx-auto px-4 max-w-7xl">
        <h1 className="text-4xl md:text-5xl font-black mb-12 text-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Data Archives
          </span>
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(groupedData).map(([category, items]) => (
            <div 
              key={category}
              className="group relative"
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/50 to-purple-500/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-6 border border-cyan-500/20">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-cyan-400">
                    {category}
                  </h2>
                  <span className="bg-black/40 text-cyan-400 text-sm px-3 py-1 rounded-full border border-cyan-500/20">
                    {items.length} items
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  {items.map((item) => (
                    <div 
                      key={item.blobId}
                      className="text-sm text-gray-400 truncate font-mono bg-black/40 p-2 rounded-lg border border-cyan-500/10"
                      title={item.blobId}
                    >
                      {item.blobId.substring(0, 20)}...
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => downloadAllBlobs(category)}
                  disabled={downloading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 
                    text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 
                    disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-cyan-500/25"
                >
                  {downloading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Downloading...
                    </span>
                  ) : (
                    'Download All'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 