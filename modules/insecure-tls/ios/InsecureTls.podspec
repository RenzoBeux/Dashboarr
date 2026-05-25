Pod::Spec.new do |s|
  s.name           = 'InsecureTls'
  s.version        = '1.0.0'
  s.summary        = 'Per-host TLS certificate validation bypass for Dashboarr'
  s.description    = 'Lets the user opt specific self-hosted hosts out of TLS certificate validation (self-signed / invalid certs).'
  s.author         = 'Dashboarr'
  s.homepage       = 'https://github.com/RenzoBeux/Dashboarr'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
