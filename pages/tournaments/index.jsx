import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import { ethers } from 'ethers';
import { TOURNAMENT_MODES, PRIZE_DISTRIBUTIONS } from '../../config/tournamentModes';

// Challenge Modal Component
const ChallengeModal = ({ isOpen, onClose, challenge }) => {
  if (!isOpen) return null;

  // Function to format markdown-style text
  const formatText = (text) => {
    return text
      .split('\n')
      .map((line, index) => {
        // Handle bold text
        line = line.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-purple-400">$1</span>');
        
        // Handle bullet points
        if (line.trim().startsWith('-')) {
          return `<li class="ml-4 text-gray-300">${line.substring(1)}</li>`;
        }
        
        // Handle numbered lists
        if (/^\d+\./.test(line.trim())) {
          return `<li class="ml-4 text-gray-300">${line}</li>`;
        }
        
        return `<p class="text-gray-300">${line}</p>`;
      })
      .join('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl relative border border-purple-500/20">
        {/* Header */}
        <div className="p-6 border-b border-purple-500/20">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            Challenge Details
          </h3>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div 
            className="prose prose-invert max-w-none space-y-4"
            dangerouslySetInnerHTML={{ __html: formatText(challenge) }}
          />
        </div>
      </div>
    </div>
  );
};

export default function Tournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { authenticated, user } = usePrivy();
  const router = useRouter();
  const { wallets } = useWallets();
  const [enteringStates, setEnteringStates] = useState({});
  const [userAttempts, setUserAttempts] = useState({});
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchUserAttempts = async (tournaments) => {
    if (!authenticated || !wallets[0]) return;
    
    const userAddress = await wallets[0].address;
    const attempts = {};
    
    tournaments.forEach(tournament => {
      const participant = tournament.participants?.find(
        p => p.address.toLowerCase() === userAddress.toLowerCase()
      );
      attempts[tournament._id] = participant?.attemptsLeft || 0;
    });
    
    setUserAttempts(attempts);
  };

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/tournaments');
      if (!response.ok) {
        throw new Error('Failed to fetch tournaments');
      }
      const data = await response.json();
      
      
     // In the fetchTournaments function
const tournamentsWithCorrectCount = data.map(tournament => ({
  ...tournament,
  currentParticipants: tournament.currentParticipants 
}));
      
      setTournaments(tournamentsWithCorrectCount);
      await fetchUserAttempts(tournamentsWithCorrectCount);
    } catch (err) {
      console.error('Error fetching tournaments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const enterTournament = async (tournament) => {
    if (!authenticated) {
      return router.push('/login');
    }

    try {
      // Set loading state for this specific tournament only
      setEnteringStates(prev => ({
        ...prev,
        [tournament._id]: true
      }));

      const wallet = wallets[0];
      
      if (!wallet || !window.ethereum) {
        throw new Error('No wallet connected');
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Send entry fee to treasury
      const tx = await signer.sendTransaction({
        to: tournament.treasuryAddress,
        value: ethers.utils.parseEther(tournament.entryFee.toString()),
        chainId: 84532
      });

      await tx.wait();

      // Register entry with backend
      const response = await fetch(`/api/tournaments/${tournament._id}/enter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress,
          transactionHash: tx.hash
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to enter tournament');
      }

      // Update attempts for this specific tournament
      setUserAttempts(prev => ({
        ...prev,
        [tournament._id]: data.attemptsLeft || prev[tournament._id]
      }));

      await fetchTournaments();
      toast.success('Successfully entered tournament!');
    } catch (error) {
      console.error('Error entering tournament:', error);
      toast.error(error.message || 'Failed to enter tournament');
    } finally {
      // Clear loading state for this specific tournament only
      setEnteringStates(prev => ({
        ...prev,
        [tournament._id]: false
      }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 p-4 bg-gradient-to-b from-gray-900 to-black">
        <main className="container mx-auto max-w-6xl text-center">
          <div className="animate-pulse text-purple-400">Loading tournaments...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-20 p-4 bg-gradient-to-b from-gray-900 to-black">
        <main className="container mx-auto max-w-6xl text-center">
          <div className="text-red-400">Error: {error}</div>
          <button 
            onClick={fetchTournaments}
            className="mt-4 px-4 py-2 bg-purple-500 rounded-lg hover:bg-purple-600"
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 p-4 bg-gradient-to-b from-gray-900 to-black">
      <main className="container mx-auto max-w-6xl">
        {/* <h1 className="text-5xl font-bold text-center mb-12 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 animate-gradient">
          Neural Arena ({tournaments.length})
        </h1> */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tournaments.map((tournament) => (
            <div key={tournament._id} 
              className="group relative overflow-hidden rounded-2xl transition-all duration-500 hover:scale-[1.02]"
            >
              {/* Card Background with Gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black"></div>
              
              {/* Animated Border Effect */}
              <div className="absolute inset-[1px] bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              {/* Card Content */}
              <div className="relative p-6 backdrop-blur-sm">
                {/* Status Badge */}
                <div className={`
                  absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold z-10
                  ${tournament.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50'
                    : 'bg-red-500/10 text-red-400 border border-red-500/50'
                  }
                `}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 
                    ${tournament.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
                  ></span>
                  {tournament.status}
                </div>

                {/* Mode Badge */}
                <div className={`
                  absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-semibold z-10
                  bg-${TOURNAMENT_MODES[tournament.mode].color}-500/10 
                  text-${TOURNAMENT_MODES[tournament.mode].color}-400 
                  border border-${TOURNAMENT_MODES[tournament.mode].color}-500/50
                `}>
                  {TOURNAMENT_MODES[tournament.mode].icon} {TOURNAMENT_MODES[tournament.mode].name}
                </div>

                {/* Tournament Title */}
                <div className="mt-12 mb-4">
                  <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                    {tournament.name}
                  </h3>
                </div>

                {/* Tournament Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-black/30 rounded-xl p-3">
                    <div className="text-sm text-gray-400">Entry Fee</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {tournament.entryFee} ETH
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3">
                    <div className="text-sm text-gray-400">Participants</div>
                    <div className="text-lg font-bold text-cyan-400">
                      {tournament.currentParticipants || 0}/{tournament.maxParticipants}
                    </div>
                  </div>
                </div>

                {/* Challenge Preview */}
                <div className="mb-6">
                  <button 
                    onClick={() => setSelectedChallenge(tournament.challengeStatement)}
                    className="w-full bg-black/30 hover:bg-black/50 rounded-xl p-3 text-left transition-colors"
                  >
                    <div className="text-sm text-gray-400 mb-1">Challenge Preview</div>
                    <div className="text-cyan-400 line-clamp-2">
                      {tournament.challengeStatement}
                    </div>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {authenticated ? (
                    <>
                      <button
                        onClick={() => router.push(`/arena/${tournament._id}`)}
                        className="flex-1 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 
                          border border-emerald-500/50 rounded-lg text-emerald-400 
                          transition-colors duration-300"
                      >
                        View Arena
                      </button>
                      <button
                        onClick={() => enterTournament(tournament)}
                        disabled={enteringStates[tournament._id]}
                        className="flex-1 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 
                          border border-cyan-500/50 rounded-lg text-cyan-400 
                          transition-colors duration-300 disabled:opacity-50"
                      >
                        {enteringStates[tournament._id] ? 'Entering...' : 'Enter'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => router.push('/login')}
                      className="w-full px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 
                        border border-emerald-500/50 rounded-lg text-emerald-400 
                        transition-colors duration-300"
                    >
                      Connect to Enter
                    </button>
                  )}
                </div>

                {/* Attempts Counter */}
                {authenticated && userAttempts[tournament._id] !== undefined && (
                  <div className="mt-4 text-center text-sm text-gray-400">
                    Attempts remaining: {userAttempts[tournament._id]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Challenge Modal */}
        <ChallengeModal 
          isOpen={!!selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          challenge={selectedChallenge}
        />

        {/* Create Tournament Button */}
        {authenticated && (
          <div className="fixed bottom-8 right-8">
            <button
              onClick={() => router.push('/tournaments/create')}
              className="bg-gradient-to-r from-purple-500 to-cyan-500 
                text-white rounded-full p-4 shadow-lg shadow-purple-500/25
                transition-all duration-300 hover:scale-105 hover:shadow-purple-500/50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}
      </main>
    </div>
  );
} 