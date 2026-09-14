"""Render original text slides; used only to regenerate checked-in tutorial videos."""
import json, sys
from PIL import Image, ImageDraw, ImageFont
slide = json.loads(sys.stdin.read())
image = Image.new('RGB', (960, 540), '#161e18')
draw = ImageDraw.Draw(image)
font_path = sys.argv[2]
font = ImageFont.truetype(font_path, 32)
small = ImageFont.truetype(font_path, 22)
large = ImageFont.truetype(font_path, 40)
draw.text((60, 60), 'QA QUEST  /  LEARN BY DOING', font=small, fill='#baf478')
draw.text((60, 165), slide[0], font=large, fill='#eaf2e7')
draw.multiline_text((60, 245), slide[1], font=font, fill='#d3ddd1', spacing=20)
draw.rounded_rectangle((60, 445, 900, 451), radius=3, fill='#3b5139')
draw.text((60, 475), 'Read the requirement. Follow the evidence.', font=small, fill='#baf478')
image.save(sys.argv[1])
