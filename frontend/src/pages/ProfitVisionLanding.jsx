import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Menu, X, TrendingUp, Users, BookOpen, Award, Mail, Phone, MapPin, Send } from 'lucide-react'
import logo from '../assets/logo.png'

const ProfitVisionLanding = () => {
  const navigate = useNavigate()
  const [scrollY, setScrollY] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' })
  const [contactLoading, setContactLoading] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const chartRef = useRef(null)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Chart.js initialization
  useEffect(() => {
    if (chartRef.current && window.Chart) {
      const ctx = chartRef.current.getContext('2d')
      new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{
            label: 'Monthly Profit ($)',
            data: [2500, 3200, 4100, 5200, 6800, 7500, 8900, 10200, 11500, 13200, 14800, 16500],
            borderColor: '#d4af37',
            backgroundColor: 'rgba(212, 175, 55, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: '#00d4ff',
            pointBorderColor: '#d4af37',
            pointBorderWidth: 2,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.1)' },
              ticks: { color: '#9ca3af' }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#9ca3af' }
            }
          }
        }
      })
    }
  }, [])

  const testimonials = [
    {
      name: 'Alex Johnson',
      role: 'Crypto Trader',
      text: 'Profit Vision FX has transformed my trading journey. The copy trading feature is incredibly intuitive and profitable.',
      avatar: 'AJ'
    },
    {
      name: 'Sarah Williams',
      role: 'Financial Analyst',
      text: 'Best trading platform I\'ve used. The signals are accurate and the UI is sleek. Highly recommended!',
      avatar: 'SW'
    },
    {
      name: 'Michael Chen',
      role: 'Professional Trader',
      text: 'The performance metrics and real-time analytics make decision-making so much easier. Love this platform!',
      avatar: 'MC'
    }
  ]

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
    setMobileMenuOpen(false)
  }

  return (
    <div className="bg-gradient-to-b from-slate-950 via-blue-950 to-slate-950 text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-slate-950 to-slate-900/20"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-yellow-600/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-slate-950/95 backdrop-blur-md border-b border-yellow-500/20' : 'bg-slate-950/50 backdrop-blur-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="ProfitVision FX" className="h-12 w-auto" />
            <div className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
              ProfitVision FX
            </div>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {['About', 'Trading', 'Features', 'Career', 'Earning', 'Reviews', 'Contact'].map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase())}
                className="text-gray-300 hover:text-yellow-400 transition-colors duration-300 font-medium"
              >
                {item}
              </button>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-yellow-400"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div className="hidden md:flex items-center gap-3">
            <button 
              onClick={() => navigate('/login')}
              className="px-6 py-2 border-2 border-yellow-500 rounded-lg font-semibold hover:bg-yellow-500/10 transition-all duration-300 text-yellow-400"
            >
              Login
            </button>
            <button 
              onClick={() => navigate('/signup')}
              className="px-6 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 text-slate-900"
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-950/95 border-t border-yellow-500/20 p-4 space-y-3">
            {['About', 'Trading', 'Career', 'Earning', 'Reviews'].map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase())}
                className="block w-full text-left text-gray-300 hover:text-yellow-400 py-2"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="hero" className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 min-h-screen flex items-center z-10">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in-up">
              <div>
                <div className="text-center md:text-left mb-6">
                  <p className="text-xl font-semibold text-yellow-400 tracking-widest">WELCOME TO</p>
                </div>
                <h1 className="text-6xl md:text-7xl font-bold leading-tight mb-4">
                  <span className="bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 bg-clip-text text-transparent">
                    ProfitVision
                  </span>
                  <br />
                  <span className="text-white">FX</span>
                </h1>
                <p className="text-xl text-gray-300 leading-relaxed">
                  Your trusted trading partner. We provide up-to-date analytics, effective strategies and useful tools for consistent profits.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => navigate('/signup')}
                  className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg font-bold hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 text-slate-900 hover:scale-105"
                >
                  Start Trading
                </button>
                <button 
                  onClick={() => navigate('/login')}
                  className="px-8 py-4 border-2 border-yellow-500 rounded-lg font-bold hover:bg-yellow-500/10 transition-all duration-300"
                >
                  Login
                </button>
              </div>
            </div>

            {/* Hero Card */}
            <div className="relative h-96 md:h-full min-h-96 animate-fade-in-up" style={{animationDelay: '0.2s'}}>
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-2xl"></div>
              <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8 h-full flex flex-col justify-center">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-green-400 font-semibold">Live Trading Active</span>
                  </div>
                  <div className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-blue-400 bg-clip-text text-transparent">
                    +245%
                  </div>
                  <p className="text-gray-400">Year-to-Date Profit</p>
                  <div className="pt-4 border-t border-yellow-500/20 space-y-2">
                    <p className="text-sm text-gray-400">Active Traders</p>
                    <p className="text-3xl font-bold text-blue-400">8,542+</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-fade-in-up">
              <h2 className="text-5xl font-bold">
                About <span className="text-yellow-400">Profit Vision FX</span>
              </h2>
              <div className="space-y-4 text-gray-300 leading-relaxed">
                <p>
                  <span className="text-yellow-400 font-semibold">Registered in UK</span> and <span className="text-yellow-400 font-semibold">based in Dubai</span>, we are a team of professional traders and mentors.
                </p>
                <p>
                  We use our expertise and knowledge to generate consistent profits <span className="text-yellow-400 font-semibold">daily, monthly, and yearly</span>.
                </p>
                <p>
                  Our team has <span className="text-yellow-400 font-semibold">strong fundamentals and technical knowledge</span> applied during live trading.
                </p>
                <p>
                  We're expanding globally to provide <span className="text-yellow-400 font-semibold">financial freedom opportunities</span> to clients worldwide.
                </p>
              </div>
              <div className="pt-4 space-y-3">
                {['UK Registered', 'Professional Team', 'Proven Track Record', 'Global Expansion'].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-gradient-to-r from-yellow-400 to-blue-400 rounded-full"></div>
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative h-96 md:h-full min-h-96 animate-fade-in-up" style={{animationDelay: '0.2s'}}>
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-2xl"></div>
              <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8 h-full flex flex-col justify-center">
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-2">10+</div>
                    <p className="text-gray-400">Years Experience</p>
                  </div>
                  <div className="border-t border-yellow-500/20 pt-6 text-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-2">5000+</div>
                    <p className="text-gray-400">Active Traders</p>
                  </div>
                  <div className="border-t border-yellow-500/20 pt-6 text-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-2">$50M+</div>
                    <p className="text-gray-400">Trading Volume</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trading Features Section */}
      <section id="features" className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-blue-900/10 to-transparent z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              Advanced Trading <span className="text-yellow-400">Features</span>
            </h2>
            <p className="text-gray-400 text-lg">Everything you need for successful trading</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Real-time Analytics',
                description: 'Live market data, advanced charts, and technical indicators',
                icon: '📊',
                image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&h=300&fit=crop'
              },
              {
                title: 'Risk Management',
                description: 'Stop loss, take profit, and position sizing tools',
                icon: '🛡️',
                image: 'https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=500&h=300&fit=crop'
              },
              {
                title: '24/7 Support',
                description: 'Expert support team available round the clock',
                icon: '💬',
                image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=300&fit=crop'
              },
              {
                title: 'Mobile Trading',
                description: 'Trade on the go with our mobile app',
                icon: '📱',
                image: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=500&h=300&fit=crop'
              },
              {
                title: 'Educational Resources',
                description: 'Webinars, tutorials, and trading guides',
                icon: '📚',
                image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=300&fit=crop'
              },
              {
                title: 'Secure Platform',
                description: 'Bank-level security and encryption',
                icon: '🔒',
                image: 'https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=500&h=300&fit=crop'
              }
            ].map((feature, i) => (
              <div key={i} className="group relative animate-fade-in-up" style={{animationDelay: `${i * 0.1}s`}}>
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl overflow-hidden hover:border-yellow-500/60 transition-all duration-300">
                  <div className="h-32 bg-gradient-to-br from-yellow-500/10 to-blue-500/10 overflow-hidden">
                    <img 
                      src={feature.image} 
                      alt={feature.title}
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  </div>
                  <div className="p-6">
                    <div className="text-4xl mb-3">{feature.icon}</div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-gray-400">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Types of Trading */}
      <section id="trading" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              Types of <span className="text-yellow-400">Trading</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: 'Manual Trading',
                description: 'Trade on your own decisions with full control over your strategy and risk management.',
                icon: '📈',
                features: ['Full Control', 'Personal Strategy', 'Real-time Decisions']
              },
              {
                title: 'Copy Trading',
                description: 'Follow expert traders\' strategies and earn without active daily trading.',
                icon: '👥',
                features: ['Expert Strategies', 'Passive Income', 'Risk Management']
              }
            ].map((type, i) => (
              <div key={i} className="group relative animate-fade-in-up" style={{animationDelay: `${i * 0.1}s`}}>
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8 hover:border-yellow-500/60 transition-all duration-300">
                  <div className="text-4xl mb-4">{type.icon}</div>
                  <h3 className="text-2xl font-bold mb-3">{type.title}</h3>
                  <p className="text-gray-400 mb-6">{type.description}</p>
                  <div className="space-y-2">
                    {type.features.map((feature, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                        <span className="text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Career Path */}
      <section id="career" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              Career Path in <span className="text-yellow-400">Trading</span>
            </h2>
          </div>

          <div className="space-y-8 max-w-2xl mx-auto">
            {[
              { step: '1', title: 'Learn Forex Basics & Advanced Concepts', desc: 'Study charts, indicators, currency pairs, and risk management.' },
              { step: '2', title: 'Trade Manually in Your Own Account', desc: 'Practice strategies, manage risk, and understand market behavior firsthand.' },
              { step: '3', title: 'Trade in Company Account', desc: 'Gain experience trading professionally while sharing profits with Prop Fund.' },
              { step: '4', title: 'Invest and Enjoy Copy Trading', desc: 'Mirror successful traders and earn without active daily trading.' }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start animate-fade-in-up" style={{animationDelay: `${i * 0.1}s`}}>
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 text-white font-bold text-lg">
                    {item.step}
                  </div>
                </div>
                <div className="flex-grow">
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Copy Trading Earning */}
      <section id="earning" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              How to Earn with <span className="text-yellow-400">Copy Trading</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6 animate-fade-in-up">
              <div className="flex gap-4">
                <div className="text-yellow-400 font-bold text-xl">◆</div>
                <div>
                  <p className="font-semibold">Open a Trading Account</p>
                  <p className="text-gray-400 text-sm">Minimum deposit: $1,000 & above</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-yellow-400 font-bold text-xl">◆</div>
                <div>
                  <p className="font-semibold">Profit Sharing</p>
                  <p className="text-gray-400 text-sm">50% - You | 50% - Company</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-yellow-400 font-bold text-xl">◆</div>
                <div>
                  <p className="font-semibold">Expected Returns</p>
                  <p className="text-gray-400 text-sm">2x in 18 months</p>
                </div>
              </div>
            </div>

            <div className="relative animate-fade-in-up" style={{animationDelay: '0.2s'}}>
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/30 to-yellow-600/20 rounded-2xl blur-2xl"></div>
              <div className="relative bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 backdrop-blur border-2 border-yellow-500/50 rounded-2xl p-8 shadow-lg shadow-yellow-500/20">
                <h3 className="text-2xl font-bold text-yellow-400 mb-6 flex items-center gap-2">
                  ✓ Example Calculation
                </h3>
                <div className="space-y-3 text-sm text-gray-200">
                  <div className="flex justify-between">
                    <span>Account size</span>
                    <span className="font-semibold">$1,100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily profit assumption (1%)</span>
                    <span className="font-semibold">$10</span>
                  </div>
                  <div className="border-t border-yellow-500/30 pt-3 flex justify-between">
                    <span>Your share (50%)</span>
                    <span className="font-semibold text-yellow-400">$5/day</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly income</span>
                    <span className="font-semibold text-yellow-400">$110</span>
                  </div>
                  <div className="border-t border-yellow-500/30 pt-3 flex justify-between">
                    <span>In 18 months</span>
                    <span className="font-semibold text-yellow-400">$1,980 (~200%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="reviews" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              Our Traders'
              <br />
              <span className="text-yellow-400">Reviews</span>
            </h2>
          </div>

          <div className="relative animate-fade-in-up">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-2xl"></div>
            <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8">
              <p className="text-gray-300 mb-6 italic text-lg">{testimonials[activeTestimonial].text}</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center text-white font-bold">
                  {testimonials[activeTestimonial].avatar}
                </div>
                <div>
                  <p className="font-bold text-white">{testimonials[activeTestimonial].name}</p>
                  <p className="text-sm text-gray-400">{testimonials[activeTestimonial].role}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={() => setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
              className="p-3 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 text-slate-900"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setActiveTestimonial((prev) => (prev + 1) % testimonials.length)}
              className="p-3 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 text-slate-900"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="relative py-20 px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-5xl font-bold mb-2">
              Get in <span className="text-yellow-400">Touch</span>
            </h2>
            <p className="text-gray-400 text-lg">Have questions? We're here to help</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              {
                icon: Mail,
                title: 'Email',
                content: 'support@profitvisionfx.com',
                link: 'mailto:support@profitvisionfx.com'
              },
              {
                icon: Phone,
                title: 'Phone',
                content: '+971 4 XXX XXXX',
                link: 'tel:+97143000000'
              },
              {
                icon: MapPin,
                title: 'Location',
                content: 'Dubai, UAE',
                link: '#'
              }
            ].map((contact, i) => (
              <div key={i} className="group relative animate-fade-in-up" style={{animationDelay: `${i * 0.1}s`}}>
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8 text-center hover:border-yellow-500/60 transition-all duration-300">
                  <contact.icon className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">{contact.title}</h3>
                  <a href={contact.link} className="text-gray-400 hover:text-yellow-400 transition-colors">
                    {contact.content}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto">
            <div className="relative animate-fade-in-up">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-blue-500/20 rounded-2xl blur-2xl"></div>
              <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur border border-yellow-500/30 rounded-2xl p-8">
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  setContactLoading(true)
                  setContactMessage('')

                  try {
                    const response = await fetch('/api/contact/send', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(contactForm)
                    })

                    const data = await response.json()

                    if (response.ok && data.success) {
                      setContactMessage('✓ Message sent successfully! We will get back to you soon.')
                      setContactForm({ name: '', email: '', message: '' })
                      setTimeout(() => setContactMessage(''), 5000)
                    } else {
                      setContactMessage('✗ ' + (data.message || 'Failed to send message. Please try again.'))
                    }
                  } catch (error) {
                    console.error('Contact form error:', error)
                    setContactMessage('✗ Error sending message. Please try again later.')
                  } finally {
                    setContactLoading(false)
                  }
                }} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                      className="w-full bg-slate-700/50 border border-yellow-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Your Email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                      className="w-full bg-slate-700/50 border border-yellow-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder="Your Message"
                      rows="4"
                      value={contactForm.message}
                      onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                      className="w-full bg-slate-700/50 border border-yellow-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                      required
                    ></textarea>
                  </div>
                  {contactMessage && (
                    <div className={`p-3 rounded-lg text-center font-semibold ${
                      contactMessage.startsWith('✓') 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {contactMessage}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={contactLoading}
                    className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg py-3 font-bold hover:shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 text-slate-900 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {contactLoading ? 'Sending...' : 'Send Message'}
                    {!contactLoading && <Send size={18} className="group-hover:translate-x-1 transition-transform" />}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-yellow-500/20 py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-t from-yellow-900/10 to-transparent z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400">© 2024 Profit Vision FX. All rights reserved. | Trading involves risk. Please trade responsibly.</p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">Privacy Policy</a>
              <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">Terms of Use</a>
              <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  )
}

export default ProfitVisionLanding
