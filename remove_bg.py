from PIL import Image

def make_transparent(image_path):
    img = Image.open(image_path).convert('RGBA')
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # Change all white (also shades of whites) to transparent
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(image_path, 'PNG')

make_transparent('public/logo.png')
