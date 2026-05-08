import sys
import datetime
import requests
import random
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, 
                             QLabel, QTableWidget, QTableWidgetItem, QPushButton, 
                             QHeaderView, QFileDialog, QMessageBox, QSizePolicy, QAbstractItemView, QComboBox)
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont, QColor

from regions import REGIONS

KMA_API_KEY = "a50769958abbb8124ed0f48bdd5cb0841bbf509a1a2a5d741f8e35e56dc5f7c1"
AIR_API_KEY = "9f84be7b8da01571f296c24da19af99137e883b3a55546affe686c7b992ae819"

def get_wind_strength(wsd):
    if wsd >= 10: return '강'
    if wsd >= 4: return '약간 강'
    return '약'

def get_wind_dir_icon(vec):
    arrow_index = int(((vec + 180 + 22.5) % 360) / 45)
    arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
    return arrows[arrow_index]

def get_weather_icon(sky, pty):
    if pty in [1, 4]: return '☔' # 비
    if pty in [2, 3]: return '❄️' # 눈
    if sky == 1: return '☀️'     # 맑음
    if sky == 3: return '⛅'     # 구름많음
    return '☁️'                  # 흐림

class WeatherApp(QWidget):
    def __init__(self):
        super().__init__()
        self.initUI()
        self.fetch_data()

    def initUI(self):
        self.setWindowTitle("기상 모니터링")
        self.setStyleSheet("background-color: white; color: black; font-family: 'Malgun Gothic';")
        self.resize(800, 750)

        main_layout = QVBoxLayout()
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(20, 20, 20, 20)
        self.setLayout(main_layout)

        # 0. 지역 선택
        region_layout = QHBoxLayout()
        self.cb_region1 = QComboBox()
        self.cb_region2 = QComboBox()
        self.cb_region3 = QComboBox()
        
        self.cb_region1.setStyleSheet("font-size: 16px; padding: 5px;")
        self.cb_region2.setStyleSheet("font-size: 16px; padding: 5px;")
        self.cb_region3.setStyleSheet("font-size: 16px; padding: 5px;")

        self.cb_region1.addItems(REGIONS.keys())
        self.cb_region1.currentTextChanged.connect(self.update_region2)
        self.cb_region2.currentTextChanged.connect(self.update_region3)
        self.cb_region3.currentTextChanged.connect(self.fetch_data)

        region_layout.addWidget(QLabel("지역 선택:"))
        region_layout.addWidget(self.cb_region1)
        region_layout.addWidget(self.cb_region2)
        region_layout.addWidget(self.cb_region3)
        region_layout.addStretch()
        main_layout.addLayout(region_layout)

        self.update_region2()
        self.cb_region1.setCurrentText("서울특별시")
        self.cb_region2.setCurrentText("송파구")
        self.update_region3()
        self.cb_region3.setCurrentText("장지동")
        
        # 1. 풍속현황
        self.wind_widget = QWidget()
        wind_layout = QVBoxLayout()
        wind_layout.setContentsMargins(0, 0, 0, 0)
        wind_layout.setSpacing(5)
        self.wind_widget.setLayout(wind_layout)

        wind_title = QLabel(" 풍속현황 ")
        wind_title.setStyleSheet("font-size: 26px; font-weight: bold; border-left: 14px solid black; border-bottom: 2px solid black; padding-left: 8px;")
        wind_title.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
        wind_layout.addWidget(wind_title)

        self.wind_table = QTableWidget(4, 2)
        self.wind_table.horizontalHeader().setVisible(False)
        self.wind_table.verticalHeader().setVisible(False)
        self.wind_table.setFocusPolicy(Qt.NoFocus)
        self.wind_table.setSelectionMode(QAbstractItemView.NoSelection)
        self.wind_table.setStyleSheet("""
            QTableWidget { border: 2px solid black; gridline-color: black; font-size: 22px; font-weight: bold; background-color: white; }
            QTableWidget::item { border: 1px solid black; padding: 15px; }
        """)
        self.wind_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.wind_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.wind_table.verticalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.wind_table.setFixedHeight(260)

        wind_headers = ["시간", "순간\n풍속", "평균\n풍속", "비고"]
        for i, text in enumerate(wind_headers):
            item = QTableWidgetItem(text)
            item.setTextAlignment(Qt.AlignCenter)
            item.setBackground(QColor("#f4f4f4"))
            self.wind_table.setItem(i, 0, item)
            
            val_item = QTableWidgetItem("-")
            val_item.setTextAlignment(Qt.AlignCenter)
            self.wind_table.setItem(i, 1, val_item)

        wind_layout.addWidget(self.wind_table)
        main_layout.addWidget(self.wind_widget)

        # 2. 일기예보
        self.forecast_widget = QWidget()
        self.forecast_widget.setStyleSheet("background-color: white;")
        forecast_layout = QVBoxLayout()
        forecast_layout.setContentsMargins(0, 0, 0, 0)
        forecast_layout.setSpacing(5)
        self.forecast_widget.setLayout(forecast_layout)

        title_layout = QHBoxLayout()
        forecast_title = QLabel(" 일기예보 ")
        forecast_title.setStyleSheet("font-size: 20px; font-weight: bold; border-left: 8px solid black; border-bottom: 2px solid black; padding-left: 5px;")
        forecast_title.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
        title_layout.addWidget(forecast_title)

        self.forecast_table = QTableWidget(6, 7)
        self.forecast_table.horizontalHeader().setVisible(False)
        self.forecast_table.verticalHeader().setVisible(False)
        self.forecast_table.setFocusPolicy(Qt.NoFocus)
        self.forecast_table.setSelectionMode(QAbstractItemView.NoSelection)
        self.forecast_table.setStyleSheet("""
            QTableWidget { border: 2px solid black; gridline-color: black; font-size: 16px; font-weight: bold; background-color: white; }
            QTableWidget::item { border: 1px solid black; padding: 10px; }
        """)
        
        self.forecast_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.forecast_table.verticalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.forecast_table.setFixedHeight(340)

        date_header_item = QTableWidgetItem("날짜")
        date_header_item.setTextAlignment(Qt.AlignCenter)
        date_header_item.setBackground(QColor("#f4f4f4"))
        self.forecast_table.setItem(0, 0, date_header_item)

        time_header_item = QTableWidgetItem("시각")
        time_header_item.setTextAlignment(Qt.AlignCenter)
        time_header_item.setBackground(QColor("#f4f4f4"))
        self.forecast_table.setItem(1, 0, time_header_item)

        fcst_headers = ["날 씨", "기 온", "강수\n확률", "바람\n(m/s)"]
        for i, text in enumerate(fcst_headers):
            item = QTableWidgetItem(text)
            item.setTextAlignment(Qt.AlignCenter)
            item.setBackground(QColor("#f4f4f4"))
            self.forecast_table.setItem(i+2, 0, item)

        for i in range(1, 7):
            item = QTableWidgetItem("오전" if i % 2 != 0 else "오후")
            item.setTextAlignment(Qt.AlignCenter)
            item.setBackground(QColor("#f4f4f4"))
            self.forecast_table.setItem(1, i, item)

        forecast_layout.addWidget(self.forecast_table)
        
        self.base_time_label = QLabel("업데이트 기준: -")
        self.base_time_label.setStyleSheet("font-size: 14px; color: #555555; margin-top: 5px;")
        forecast_layout.addWidget(self.base_time_label)
        main_layout.addWidget(self.forecast_widget)

        # 3. 스크린샷 버튼
        self.btn_screenshot = QPushButton("일기예보 스크린샷")
        self.btn_screenshot.setStyleSheet("""
            QPushButton {
                font-size: 18px; font-weight: bold; padding: 15px;
                background-color: #3d8bcd; color: white; border-radius: 8px;
            }
            QPushButton:hover { background-color: #2b6fa6; }
        """)
        self.btn_screenshot.clicked.connect(self.take_screenshot)
        main_layout.addWidget(self.btn_screenshot)

    def update_region2(self):
        r1 = self.cb_region1.currentText()
        self.cb_region2.clear()
        if r1 in REGIONS:
            self.cb_region2.addItems(REGIONS[r1].keys())
            
    def update_region3(self):
        r1 = self.cb_region1.currentText()
        r2 = self.cb_region2.currentText()
        self.cb_region3.clear()
        if r1 in REGIONS and r2 in REGIONS[r1]:
            d_list = REGIONS[r1][r2].get("d", [])
            self.cb_region3.addItems(d_list)

    def fetch_data(self):
        r1 = self.cb_region1.currentText()
        r2 = self.cb_region2.currentText()
        r3 = self.cb_region3.currentText()
        
        nx, ny, st = 62, 126, "송파구" # Default
        if r1 in REGIONS and r2 in REGIONS[r1]:
            nx = REGIONS[r1][r2].get("nx", 62)
            ny = REGIONS[r1][r2].get("ny", 126)
            st = REGIONS[r1][r2].get("st", "송파구")

        # 1. 미세먼지 (에어코리아)
        pm25_status = "초미세먼지 보통"
        try:
            url_air = f"https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey={AIR_API_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={st}&dataTerm=DAILY&ver=1.0"
            res_air = requests.get(url_air, verify=False, timeout=5)
            data_air = res_air.json()
            pm25 = int(data_air['response']['body']['items'][0]['pm25Value'])
            if pm25 >= 75: pm25_status = "초미세먼지 매우나쁨"
            elif pm25 >= 35: pm25_status = "초미세먼지 나쁨"
            elif pm25 >= 15: pm25_status = "초미세먼지 보통"
            else: pm25_status = "초미세먼지 좋음"
        except Exception as e:
            print("Air API Error:", e)

        # 2. 기상청 API
        now = datetime.datetime.now()
        yesterday = now - datetime.timedelta(days=1)
        base_date = yesterday.strftime('%Y%m%d')
        base_time = "2300"
        
        try:
            url_kma = f"https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey={KMA_API_KEY}&numOfRows=1000&pageNo=1&dataType=JSON&base_date={base_date}&base_time={base_time}&nx={nx}&ny={ny}"
            res_kma = requests.get(url_kma, verify=False, timeout=5)
            data_kma = res_kma.json()
            items = data_kma['response']['body']['items']['item']
            
            forecast = {}
            for item in items:
                f_date = item['fcstDate']
                f_time = item['fcstTime']
                cat = item['category']
                val = item['fcstValue']
                if f_date not in forecast: forecast[f_date] = {}
                if f_time not in forecast[f_date]: forecast[f_date][f_time] = {}
                forecast[f_date][f_time][cat] = val
                
            # 현재 풍속 (가장 최근 예보값 기준)
            today_date = now.strftime('%Y%m%d')
            current_hour = now.strftime('%H00')
            wsd = 5.8
            avg_wsd = 4.0
            
            if today_date in forecast and current_hour in forecast[today_date]:
                try:
                    wsd = float(forecast[today_date][current_hour].get('WSD', 5.8))
                    avg_wsd = wsd * 0.7
                except: pass

            self.wind_table.item(0, 1).setText(now.strftime('%H시'))
            self.wind_table.item(1, 1).setText(f"{wsd:.1f}m/s")
            self.wind_table.item(2, 1).setText(f"{avg_wsd:.1f}m/s")
            self.wind_table.item(3, 1).setText(pm25_status)

            # 3일 일기예보
            dates = [now + datetime.timedelta(days=i) for i in range(3)]
            hanja_days = ['月', '火', '水', '木', '金', '土', '日']
            
            for i in range(3):
                dt = dates[i]
                hanja = hanja_days[dt.weekday()]
                
                date_item = QTableWidgetItem(f"{dt.strftime('%y.%m.%d')} ({hanja})")
                date_item.setTextAlignment(Qt.AlignCenter)
                date_item.setBackground(QColor("#f4f4f4"))
                
                if dt.weekday() == 5: # 토요일
                    date_item.setForeground(QColor("#2c7bb6"))
                elif dt.weekday() == 6: # 일요일
                    date_item.setForeground(QColor("#d7191c"))
                
                self.forecast_table.setItem(0, i*2 + 1, date_item)
                self.forecast_table.setSpan(0, i*2 + 1, 1, 2)
                
                f_date_str = dt.strftime('%Y%m%d')
                for j, target_time in enumerate(['0800', '1400']):
                    col_idx = i * 2 + j + 1
                    
                    if f_date_str in forecast and target_time in forecast[f_date_str]:
                        ft = forecast[f_date_str][target_time]
                        pop = int(ft.get('POP', 0))
                        wsd = float(ft.get('WSD', 0))
                        vec = float(ft.get('VEC', 0))
                        sky = int(ft.get('SKY', 1))
                        pty = int(ft.get('PTY', 0))
                        tmp = ft.get('TMP', '0')
                    else:
                        pop, wsd, vec, sky, pty, tmp = 0, 5.0, 0, 1, 0, "10"

                    # 날씨 아이콘
                    icon_str = get_weather_icon(sky, pty)
                    sky_item = QTableWidgetItem(icon_str)
                    sky_item.setTextAlignment(Qt.AlignCenter)
                    sky_item.setFont(QFont("Segoe UI Emoji", 20))
                    self.forecast_table.setItem(2, col_idx, sky_item)

                    # 기온
                    temp_item = QTableWidgetItem(f"{tmp}°C")
                    temp_item.setTextAlignment(Qt.AlignCenter)
                    if j == 0: # 오전
                        temp_item.setForeground(QColor("#2c7bb6"))
                    else: # 오후
                        temp_item.setForeground(QColor("#d7191c"))
                    self.forecast_table.setItem(3, col_idx, temp_item)

                    # 강수확률
                    pop_item = QTableWidgetItem(f"{pop}%" if pop > 0 else "-")
                    pop_item.setTextAlignment(Qt.AlignCenter)
                    self.forecast_table.setItem(4, col_idx, pop_item)

                    # 바람
                    w_str = get_wind_strength(wsd)
                    arrow = get_wind_dir_icon(vec)
                    wind_text = f"{arrow}\n{w_str}\n{wsd:.1f}m/s"
                    wind_item = QTableWidgetItem(wind_text)
                    wind_item.setTextAlignment(Qt.AlignCenter)
                    wind_item.setFont(QFont("Segoe UI Emoji", 15))
                    self.forecast_table.setItem(5, col_idx, wind_item)

        except Exception as e:
            print("KMA API Error:", e)

    def take_screenshot(self):
        # 일기예보 위젯만 캡처
        pixmap = self.forecast_widget.grab()
        
        options = QFileDialog.Options()
        file_path, _ = QFileDialog.getSaveFileName(self, "스크린샷 저장", "forecast_screenshot.png", "Images (*.png);;All Files (*)", options=options)
        if file_path:
            pixmap.save(file_path, "PNG")
            QMessageBox.information(self, "성공", "일기예보 스크린샷이 저장되었습니다.")

if __name__ == '__main__':
    app = QApplication(sys.argv)
    ex = WeatherApp()
    ex.show()
    sys.exit(app.exec_())
