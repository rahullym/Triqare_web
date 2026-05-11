'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/ui/logo'
import { ScrollToTop } from '@/components/ui/scroll-to-top'
import { LandingAnnouncementBanner } from '@/components/LandingAnnouncementBanner'
import { AlertTriangle, Shield, Users, Truck, Building2, Phone, Watch, Heart, MapPin, Wifi, Battery, Smartphone, Check, Download, Apple, PlayCircle } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-blue-50">
      {/* Header */}
      <header className="shadow-sm border-b sticky top-0 z-50 backdrop-blur-sm bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Logo size="header" showText={false} />
            </div>
            <div className="flex items-center space-x-3">
              <a
                href="/Triqare-mobile-app.apk"
                download="Triqare-mobile-app.apk"
                className="hidden md:inline-flex"
              >
                <Button variant="outline" size="sm" className="border-purple-600 text-purple-600 hover:bg-purple-50">
                  <Smartphone className="h-4 w-4 mr-2" />
                  Download App
                </Button>
              </a>
              <Link href="/demo">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                  Live Demo
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm" className="bg-red-600 hover:bg-red-700">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Announcements Banner */}
      <LandingAnnouncementBanner />

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-10 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500/10 to-orange-500/10 text-red-700 border border-red-200 rounded-full text-sm font-medium mb-6 animate-bounce backdrop-blur-sm">
              <AlertTriangle className="h-4 w-4 mr-2" />
              🚨 Save Lives with Smart Technology
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-6 leading-tight">
            Emergency Response
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
              Made Simple
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto leading-relaxed">
            🚑 Streamline emergency response operations with our comprehensive platform.
            Manage patients, coordinate ambulances, and save lives with
            <span className="font-semibold text-blue-600"> real-time tracking</span> and
            <span className="font-semibold text-green-600"> instant communication</span>.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-16">
            <Link href="/demo">
              <Button size="lg" className="text-lg px-12 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 font-semibold">
                <AlertTriangle className="h-5 w-5 mr-2" />
                🎯 View Live Demo
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button variant="outline" size="lg" className="text-lg px-12 py-4 border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 font-semibold">
                🚀 Get Started Free
              </Button>
            </Link>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-blue-100">
              <div className="text-3xl font-bold text-blue-600 mb-2">⚡ 30s</div>
              <div className="text-gray-700 font-medium">Average Response Time</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-indigo-100">
              <div className="text-3xl font-bold text-indigo-600 mb-2">🏥 500+</div>
              <div className="text-gray-700 font-medium">Connected Hospitals</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-purple-100">
              <div className="text-3xl font-bold text-purple-600 mb-2">💝 10K+</div>
              <div className="text-gray-700 font-medium">Lives Saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Download Section */}
      <section className="py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium mb-6">
              📱 Mobile App Available
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Download Our
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600"> Mobile App</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              🚀 Get instant access to emergency services on your mobile device. Available for patients and drivers.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Card className="overflow-hidden border-0 shadow-2xl bg-gradient-to-br from-white to-purple-50">
              <CardContent className="p-8 md:p-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  {/* Left Side - App Info */}
                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Smartphone className="h-8 w-8 text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">Triqare Mobile</h3>
                        <p className="text-gray-600">Emergency Response App</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center text-gray-700">
                        <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                        <span>One-tap emergency SOS alerts</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                        <span>Real-time ambulance tracking</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                        <span>Medical profile management</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                        <span>GPS navigation for drivers</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                        <span>24/7 emergency support</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side - Download Options */}
                  <div className="space-y-6">
                    {/* Direct APK Download */}
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center mb-4">
                        <Download className="h-6 w-6 mr-2" />
                        <h4 className="text-lg font-semibold">Direct Download</h4>
                      </div>
                      <p className="text-purple-100 text-sm mb-4">
                        Download the APK file directly to your Android device
                      </p>
                      <a
                        href="/Triqare-mobile-app.apk"
                        download="Triqare-mobile-app.apk"
                        className="block"
                      >
                        <Button
                          size="lg"
                          className="w-full bg-white text-purple-600 hover:bg-gray-100 font-bold shadow-lg hover:shadow-xl transition-all"
                        >
                          <Download className="h-5 w-5 mr-2" />
                          Download APK
                        </Button>
                      </a>
                    </div>

                    {/* App Store Buttons */}
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-white text-gray-500">Or download from stores</span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                        onClick={() => window.open('https://apps.apple.com/app/emergency-response', '_blank')}
                      >
                        <Apple className="h-5 w-5 mr-2" />
                        App Store
                      </Button>

                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                        onClick={() => window.open('https://play.google.com/store/apps/details?id=com.emergency', '_blank')}
                      >
                        <PlayCircle className="h-5 w-5 mr-2" />
                        Google Play
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Bottom Note */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-center text-sm text-gray-600">
                    <Shield className="h-4 w-4 mr-2 text-green-600" />
                    <span>Secure • HIPAA Compliant • 256-bit Encryption</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Registration Section - HIDDEN */}
      {/* <section className="py-20 bg-gradient-to-br from-purple-50 via-pink-50 to-red-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium mb-6">
              🎯 Quick Registration
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Join Our Emergency
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600"> Network</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              🚀 Get started in minutes! Register as a patient or transport company to access our emergency response services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-green-50 to-emerald-100 hover:from-green-100 hover:to-emerald-200">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-700 transition-colors">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900 mb-2">
                  👤 Patient Registration
                </CardTitle>
                <p className="text-green-700 font-medium">Create Your Medical Profile</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-4 mb-6">
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-green-600 mr-3" />
                    <span>Secure medical information storage</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-green-600 mr-3" />
                    <span>Emergency contact management</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-green-600 mr-3" />
                    <span>Insurance & hospital preferences</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-green-600 mr-3" />
                    <span>24/7 emergency access</span>
                  </div>
                </div>
                <Link href="/register/patient">
                  <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
                    <Heart className="h-5 w-5 mr-2" />
                    Register as Patient
                  </Button>
                </Link>
                <p className="text-xs text-gray-500 mt-3">
                  ⚡ Quick 4-step registration • Free forever
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-blue-50 to-indigo-100 hover:from-blue-100 hover:to-indigo-200">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-700 transition-colors">
                  <Truck className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900 mb-2">
                  🚛 Transport Company
                </CardTitle>
                <p className="text-blue-700 font-medium">Join Our Partner Network</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-4 mb-6">
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-blue-600 mr-3" />
                    <span>Access to emergency assignments</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-blue-600 mr-3" />
                    <span>Fleet & driver management tools</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-blue-600 mr-3" />
                    <span>Real-time dispatch system</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Check className="h-5 w-5 text-blue-600 mr-3" />
                    <span>Revenue tracking & reports</span>
                  </div>
                </div>
                <Link href="/register/transport-company">
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
                    <Truck className="h-5 w-5 mr-2" />
                    Register Company
                  </Button>
                </Link>
                <p className="text-xs text-gray-500 mt-3">
                  ⚡ 3-step business registration • Start earning today
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 text-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 max-w-3xl mx-auto shadow-lg">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                🔒 Secure & Compliant Registration
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600">
                <div className="flex items-center justify-center">
                  <Shield className="h-5 w-5 text-green-600 mr-2" />
                  <span>HIPAA Compliant</span>
                </div>
                <div className="flex items-center justify-center">
                  <Shield className="h-5 w-5 text-blue-600 mr-2" />
                  <span>256-bit Encryption</span>
                </div>
                <div className="flex items-center justify-center">
                  <Shield className="h-5 w-5 text-purple-600 mr-2" />
                  <span>24/7 Support</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section> */}

      {/* Features */}
      <section className="py-20 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
              ⭐ Award-Winning Platform
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Complete Emergency Management
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Solution</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              🎯 Everything you need to manage emergency response operations efficiently with
              cutting-edge technology and intuitive design
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-blue-600 rounded-lg mr-3 group-hover:bg-blue-700 transition-colors">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">👥 Patient Management</div>
                    <div className="text-sm text-blue-600 font-normal">Complete Care System</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  📋 Comprehensive patient records with medical history, emergency contacts, and
                  <span className="font-semibold text-blue-700"> real-time status tracking</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-green-600 rounded-lg mr-3 group-hover:bg-green-700 transition-colors">
                    <Truck className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">🚛 Fleet Management</div>
                    <div className="text-sm text-green-600 font-normal">Smart Dispatch System</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  🗺️ Track ambulances, manage drivers, and optimize dispatch operations with
                  <span className="font-semibold text-green-700"> real-time location data</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-purple-600 rounded-lg mr-3 group-hover:bg-purple-700 transition-colors">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">🏥 Hospital Network</div>
                    <div className="text-sm text-purple-600 font-normal">Capacity Management</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  📊 Monitor hospital capacity, specialties, and availability to ensure
                  <span className="font-semibold text-purple-700"> optimal patient placement</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-red-50 to-red-100 hover:from-red-100 hover:to-red-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-red-600 rounded-lg mr-3 group-hover:bg-red-700 transition-colors">
                    <Phone className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">📞 SOS Response</div>
                    <div className="text-sm text-red-600 font-normal">Emergency Dispatch</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  🚨 Rapid emergency response with automated dispatch,
                  <span className="font-semibold text-red-700"> real-time tracking</span>, and communication tools.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-orange-600 rounded-lg mr-3 group-hover:bg-orange-700 transition-colors">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">🔐 Role-Based Access</div>
                    <div className="text-sm text-orange-600 font-normal">Secure Permissions</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  🛡️ Secure access control for admins, emergency response teams, and
                  <span className="font-semibold text-orange-700"> transport companies</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-0 bg-gradient-to-br from-yellow-50 to-yellow-100 hover:from-yellow-100 hover:to-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 bg-yellow-600 rounded-lg mr-3 group-hover:bg-yellow-700 transition-colors">
                    <AlertTriangle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold">📊 Real-Time Analytics</div>
                    <div className="text-sm text-yellow-600 font-normal">Performance Insights</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  📈 Comprehensive reporting and analytics to improve
                  <span className="font-semibold text-yellow-700"> response times</span> and operational efficiency.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-32 h-32 bg-blue-400 rounded-full opacity-10 animate-pulse"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 bg-purple-400 rounded-full opacity-10 animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-400 rounded-full opacity-10 animate-pulse delay-2000"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm text-blue-100 border border-blue-400/30 rounded-full text-sm font-medium mb-6 animate-bounce">
              🚀 Join the Revolution
            </div>
          </div>

          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Ready to Transform
            <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent animate-pulse">Emergency Response?</span>
          </h2>

          <p className="text-xl md:text-2xl text-slate-200 mb-12 max-w-4xl mx-auto leading-relaxed">
            🌟 Join thousands of emergency responders who trust our platform to save lives.
            <span className="font-semibold text-blue-300 block mt-2">Start your free trial today!</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="text-lg px-12 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 font-bold border-0">
                🎯 Get Started Today
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="text-lg px-12 py-4 border-2 border-blue-400 text-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 font-bold">
                📺 Watch Demo
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <div className="text-3xl font-bold text-blue-300 mb-2">🏆 #1</div>
              <div className="text-slate-300">Emergency Platform</div>
            </div>
            <div className="text-center bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <div className="text-3xl font-bold text-purple-300 mb-2">⭐ 4.9/5</div>
              <div className="text-slate-300">Customer Rating</div>
            </div>
            <div className="text-center bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <div className="text-3xl font-bold text-indigo-300 mb-2">🔒 100%</div>
              <div className="text-slate-300">HIPAA Compliant</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center mb-8">
            <Logo size="xl" showText={false} variant="footer" />
          </div>
          <div className="text-center text-gray-400">
            <p>&copy; 2024 Emergency Response. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Scroll to Top Button */}
      <ScrollToTop />
    </div>
  )
}
