import React, { useEffect, useMemo, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Magnetometer } from 'expo-sensors';
import { CITIES } from './src/lib/constants';
import { formatClock, formatDateId, greeting } from './src/lib/time';
import { getQiblaDirection } from './src/lib/qibla';
import { normalizeTimings, nextPrayer } from './src/lib/prayer';
import { parseReminder } from './src/lib/reminders';

export default function App() {
  const [now,setNow]=useState(new Date()); const [city,setCity]=useState(CITIES[0]); const [timings,setTimings]=useState(normalizeTimings({}));
  const [cmd,setCmd]=useState(''); const [message,setMessage]=useState(''); const [rakaat,setRakaat]=useState(0); const [target,setTarget]=useState(4);
  const [camOn,setCamOn]=useState(false); const [camPerm,requestCam]=useCameraPermissions(); const [heading,setHeading]=useState<number|null>(null);
  useEffect(()=>{const i=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(i);},[]);
  useEffect(()=>{const sub=Magnetometer.addListener((d)=>setHeading(((Math.atan2(d.y,d.x)*180)/Math.PI+360)%360)); Magnetometer.setUpdateInterval(1000); return ()=>sub.remove();},[]);
  const qibla=useMemo(()=>getQiblaDirection(city.latitude,city.longitude),[city]);
  const nxt=useMemo(()=>nextPrayer(timings,now),[timings,now]);
  const fetchPrayer=async(lat:number,lon:number)=>{try{const ds=now.toISOString().slice(0,10).split('-').reverse().join('-'); const r=await fetch(`https://api.aladhan.com/v1/timings/${ds}?latitude=${lat}&longitude=${lon}&method=20`); const j=await r.json(); setTimings(normalizeTimings(j.data.timings));}catch{setMessage('Gagal ambil jadwal online, pakai data terakhir/default.');}};
  const useGps=async()=>{const p=await Location.requestForegroundPermissionsAsync(); if(!p.granted){setMessage('Izin lokasi ditolak. Pilih kota manual.'); return;} const c=await Location.getCurrentPositionAsync({}); setCity({name:'Lokasi Saat Ini',latitude:c.coords.latitude,longitude:c.coords.longitude}); fetchPrayer(c.coords.latitude,c.coords.longitude);};
  const testNotif=async()=>{try{await Notifications.setNotificationChannelAsync('prayer-reminders',{name:'Pengingat Sholat',importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,250,250,250]}); await Notifications.scheduleNotificationAsync({content:{title:'WaktuAI - Tes',body:'Notifikasi lokal Android aktif.'},trigger:null}); setMessage('Notifikasi tes terkirim.');}catch{setMessage('Izin notifikasi ditolak. Aktifkan dari pengaturan aplikasi.');}};
  const testVoice=()=>{Speech.stop(); Speech.speak('Halo, ini suara WaktuAI. Pengingat sholat aktif.');};
  const runCommand=()=>{const p=parseReminder(cmd,now); if(p){setMessage(p.message); return;} setMessage('Tenang, aku bantu. Kamu bisa pakai WaktuAI untuk tanya jam, jadwal sholat, arah kiblat, reminder, notifikasi sholat, dan hitung rakaat.');};
  return <ScrollView style={styles.container}><Text style={styles.title}>WaktuAI</Text><Text>{greeting(now)}</Text><Text style={styles.clock}>{formatClock(now)}</Text><Text>{formatDateId(now)}</Text>
  <View style={styles.card}><Text>Kota: {city.name}</Text><Button title='Gunakan GPS' onPress={useGps}/></View>
  <View style={styles.card}><Text>Sholat berikutnya: {nxt.key} {nxt.at.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</Text></View>
  <View style={styles.card}><Text>Arah Kiblat: {qibla.toFixed(1)}°</Text><Text>Arah dihitung dari utara searah jarum jam.</Text><Text>Kompas: {heading ? heading.toFixed(1):'Tidak tersedia'}</Text></View>
  <View style={styles.card}><TextInput style={styles.input} value={cmd} onChangeText={setCmd} placeholder='Ketik perintah / reminder 17:46'/><Button title='Jalankan Perintah' onPress={runCommand}/></View>
  <View style={styles.card}><Button title='Kirim Notifikasi Tes' onPress={testNotif}/><Button title='Tes Suara AI' onPress={testVoice}/></View>
  <View style={styles.card}><Text>Rakaat {rakaat}/{target}</Text><Button title='Tambah rakaat' onPress={()=>setRakaat(v=>v+1)}/><Button title='Kurangi rakaat' onPress={()=>setRakaat(v=>Math.max(0,v-1))}/><Button title='Reset' onPress={()=>setRakaat(0)}/><Button title='Selesai rakaat' onPress={()=>setMessage('Rakaat diselesaikan.')}/><Button title='Mulai Deteksi Rakaat' onPress={async()=>{if(!camPerm?.granted) await requestCam(); setCamOn(true);}}/>{camOn&&camPerm?.granted&&<CameraView style={{height:200}} facing='back'/>}<Text>Deteksi otomatis gerakan masih bergantung dukungan model. Hitung manual tetap tersedia.</Text></View>
  <Text>{message}</Text></ScrollView>;
}
const styles=StyleSheet.create({container:{flex:1,padding:16,backgroundColor:'#f4f6fb'},title:{fontSize:28,fontWeight:'700'},clock:{fontSize:40,fontWeight:'700'},card:{backgroundColor:'white',borderRadius:12,padding:12,marginTop:12,gap:8},input:{borderWidth:1,borderColor:'#ddd',borderRadius:8,padding:10,minHeight:44}});
