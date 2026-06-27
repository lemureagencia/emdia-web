from PIL import Image

def create_dark_mode_logo(input_path, output_path):
    img = Image.open(input_path).convert('RGBA')
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        r, g, b, a = item
        
        # If the pixel is not fully transparent
        if a > 0:
            # Check if the pixel is grayscale (difference between R,G,B is small)
            # and it is on the darker side (to target the text, not bright colored icon parts)
            # The vibrant colors (blue, green, yellow) will have large differences between RGB components.
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            
            if (max_val - min_val) < 40 and max_val < 150:
                # It's a dark grayscale pixel (text). Change it to white, keeping its alpha.
                # Actually, to preserve anti-aliasing perfectly, we might just set it to white (255, 255, 255, a)
                new_data.append((255, 255, 255, a))
            else:
                new_data.append(item)
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, 'PNG')

create_dark_mode_logo('public/logo.png', 'public/logo-dark.png')
